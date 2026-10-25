"""Passive process counters; no configuration changes or player commands."""
import importlib.machinery
import json
import os
from pathlib import Path
import statistics
import subprocess
import time

OUT=Path(__file__).parent
HZ=os.sysconf('SC_CLK_TCK')

def stat(pid):
    data=Path(f'/proc/{pid}/stat').read_text();v=data[data.rindex(')')+2:].split()
    return {'own':(int(v[11])+int(v[12]))/HZ,'waited':(int(v[13])+int(v[14]))/HZ,'threads':int(v[17])}
def memory(pid):
    values={}
    for line in Path(f'/proc/{pid}/smaps_rollup').read_text().splitlines():
        p=line.split();key=p[0].rstrip(':')
        if key in ('Pss','Rss','Private_Clean','Private_Dirty'):values[key]=int(p[1])/1024
    return values

def children(pid):
    found=set();pending=[pid]
    while pending:
        parent=pending.pop()
        for file in Path(f'/proc/{parent}/task').glob('*/children'):
            try: ids={int(i) for i in file.read_text().split()}
            except OSError:continue
            for child in ids-found:
                found.add(child);pending.append(child)
    return found

def tree(pid):
    cpu=0;pss=0;members=[]
    for child in {pid}|children(pid):
        try:
            s=stat(child);m=memory(child);cpu+=s['own']+s['waited'];pss+=m['Pss']
            members.append({'pid':child,'program':Path(f'/proc/{child}/comm').read_text().strip(),'Pss_MiB':round(m['Pss'],2)})
        except OSError:pass
    return {'cpu_seconds':cpu,'Pss_MiB':pss,'members':members}

def threads(pid):
    result={}
    for p in Path(f'/proc/{pid}/task').glob('[0-9]*'):
        try:
            data=(p/'stat').read_text();v=data[data.rindex(')')+2:].split()
            result[int(p.name)]={'name':(p/'comm').read_text().strip(),'cpu':(int(v[11])+int(v[12]))/HZ}
        except OSError:pass
    return result

def io(pid):
    return {line.split(':')[0]:int(line.split(':')[1]) for line in Path(f'/proc/{pid}/io').read_text().splitlines()}

def main():
    pid=int(subprocess.check_output(['systemctl','--user','show','monitor-dashboard.service','-p','MainPID','--value'],text=True))
    plasma=int(subprocess.check_output(['systemctl','--user','show','plasma-plasmashell.service','-p','MainPID','--value'],text=True))
    refresh=importlib.machinery.SourceFileLoader('resource_refresh',str(Path.cwd()/'scripts/refresh-desktop.py')).load_module()
    configs=refresh.evaluate('''var rows=[];for(var d of desktops())for(var w of d.widgets())if(w.type==="local.monitor.dashboard") {w.currentConfigGroup=["General"];rows.push({id:w.id,version:w.version,modules:w.readConfig("enabledModules","").split(","),flowRefreshMs:w.readConfig("flowRefreshMs",200),audioRefreshMs:w.readConfig("audioRefreshMs",100),flowHistorySeconds:w.readConfig("flowHistorySeconds",30),columns:w.readConfig("columns",2),cavaEnabled:w.readConfig("cavaEnabled",true),width:w.geometry.width,height:w.geometry.height,pingTargetCount:w.readConfig("targetsText","").split("\\n").filter(s=>s.trim()).length});}print(JSON.stringify(rows));''')
    initial=tree(pid);pt0=stat(plasma);tt0=threads(pid);io0=io(pid);t0=time.monotonic();samples=[]
    for _ in range(30):
        time.sleep(1)
        item=tree(pid);samples.append(item['Pss_MiB'])
    elapsed=time.monotonic()-t0;final=tree(pid);pt1=stat(plasma);tt1=threads(pid);io1=io(pid)
    cpu=(final['cpu_seconds']-initial['cpu_seconds'])/elapsed*100
    result={'duration_seconds':round(elapsed,2),'logical_cpus':os.cpu_count(),'widget_config':configs,
        'bridge_and_helpers':{'cpu_percent_one_core':round(cpu,2),'cpu_percent_whole_machine':round(cpu/os.cpu_count(),2),'Pss_MiB_mean':round(statistics.mean(samples),2),'Pss_MiB_min':round(min(samples),2),'Pss_MiB_max':round(max(samples),2),'members_at_end':final['members'],
        'read_calls_per_second':round((io1['syscr']-io0['syscr'])/elapsed,1),'read_MiB_per_second_including_proc':round((io1['rchar']-io0['rchar'])/elapsed/1024**2,2)},
        'plasma_whole_desktop_only':{'cpu_percent_one_core':round((pt1['own']-pt0['own'])/elapsed*100,2),**{k+'_MiB':round(v,2) for k,v in memory(plasma).items()}},
        'persistent_bridge_threads':sorted([{'tid':tid,'name':r['name'],'cpu_percent_one_core':round((r['cpu']-tt0[tid]['cpu'])/elapsed*100,2)} for tid,r in tt1.items() if tid in tt0],key=lambda r:r['cpu_percent_one_core'],reverse=True)[:10],
        'method':'CPU includes waited child processes and currently live descendants; 100% = one logical CPU. Plasma includes every desktop component and is not Monitor-only. proc reads are not disk throughput. One 30s passive observation, not an idle-system guarantee.'}
    (OUT/'live.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
if __name__=='__main__':main()
