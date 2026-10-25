"""Read-only collector microbenchmark and non-installed scandir prototype."""
import cProfile
import importlib.util
import io
import json
import os
from pathlib import Path
import pstats
import resource
import statistics
import stat
import sys
import time
OUT=Path(__file__).parent
sys.path.insert(0,str(Path.cwd()/'backend'))
spec=importlib.util.spec_from_file_location('audit_monitor',Path.cwd()/'backend/monitor_service.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

def scandir_clients(filter_types=False):
    clients={}
    with os.scandir('/proc') as processes:
        for proc in processes:
            if not proc.name.isdigit():continue
            try:
                if proc.stat().st_uid!=os.getuid():continue
                with os.scandir(proc.path+'/fdinfo') as descriptors:
                    for fd in descriptors:
                        if filter_types:
                            try:
                                mode=os.stat(proc.path+'/fd/'+fd.name).st_mode
                                if stat.S_ISREG(mode) or stat.S_ISDIR(mode) or stat.S_ISFIFO(mode) or stat.S_ISSOCK(mode) or stat.S_ISBLK(mode):continue
                            except OSError:pass  # Preserve fdinfo fallback when metadata is inaccessible.
                        try:
                            with open(fd.path) as stream:text=stream.read()
                        except (OSError,UnicodeError):continue
                        if 'drm-client-id:' not in text:continue
                        fields=dict(line.split(':',1) for line in text.splitlines() if ':' in line)
                        device=fields.get('drm-pdev','').strip();client=fields.get('drm-client-id','').strip()
                        engines={key.removeprefix('drm-engine-'):int(value.split()[0]) for key,value in fields.items() if key.startswith('drm-engine-')}
                        clients[(device,client)]=engines
            except (OSError,ValueError):continue
    return clients

def elapsed(call):
    start=time.perf_counter();cpu=time.process_time();value=call()
    return (time.perf_counter()-start)*1000,(time.process_time()-cpu)*1000,value

gpu=m.Gpu();stats={'baseline_clients':[],'scandir_prototype':[],'device_filter_prototype':[],'gpu_sample':[],'cpu_sample':[],'ram_sample':[]}
checks=[]
for i in range(7):
    a=elapsed(gpu.clients);b=elapsed(scandir_clients);d=elapsed(lambda:scandir_clients(True));c=elapsed(gpu.clients)
    stats['baseline_clients'].extend([(a[0],a[1]),(c[0],c[1])]);stats['scandir_prototype'].append((b[0],b[1]));stats['device_filter_prototype'].append((d[0],d[1]))
    checks.append(set(a[2]) & set(c[2]) <= set(b[2]) and set(a[2]) & set(c[2]) <= set(d[2]))
for label,call in [('gpu_sample',gpu.sample),('cpu_sample',m.Cpu().sample),('ram_sample',m.memory_snapshot)]:
    for _ in range(7):
        wall,cpu,_=elapsed(call);stats[label].append((wall,cpu))
profile=cProfile.Profile();profile.runcall(gpu.sample)
stream=io.StringIO();pstats.Stats(profile,stream=stream).sort_stats('cumulative').print_stats(15)
(OUT/'collector-cprofile.txt').write_text(stream.getvalue())
result={'benchmarks':{name:{'wall_ms_median':round(statistics.median(v[0] for v in samples),2),'cpu_ms_median':round(statistics.median(v[1] for v in samples),2)} for name,samples in stats.items()},'prototype_stable_client_key_coverage_all_trials':all(checks),'returned_gpu_sources':[{'name':r.get('name'),'scope':r.get('scope')} for r in gpu.sample()],'nvidia_query_executable_present':gpu.nvidia,'drivers':[],'method':'7 read-only trials; prototypes use scandir/open and optionally skip definite ordinary-file/socket/pipe/directory/block fd types; device/unknown types still read fdinfo. Neither is installed. Stable DRM-client keys were cross-checked against baseline scans before/after.'}
for card in Path('/sys/class/drm').glob('card[0-9]*'):
    if (card/'device/driver').exists():result['drivers'].append({'driver':(card/'device/driver').resolve().name,'direct_busy_counter':(card/'device/gpu_busy_percent').exists()})
(OUT/'collectors.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
