"""Cold local OMR comparison; never reuses or changes production jobs."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import time
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server
from omr_support import read_musicxml


def signature(path):
    root = read_musicxml(path)
    return [[(m.get('number'), [
        (e.tag, e.findtext('duration'), e.findtext('voice'), e.findtext('staff'),
         e.find('chord') is not None, e.find('rest') is not None,
         e.findtext('pitch/step'), e.findtext('pitch/alter','0'), e.findtext('pitch/octave'))
        for e in m if e.tag in ('note','backup','forward')])
        for m in part.findall('measure')] for part in root.findall('part')]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('pdf', nargs='?', default='tests/fixtures/demo-score.pdf')
    parser.add_argument('--threads', type=int, default=4)
    args = parser.parse_args()
    payload = Path(args.pdf).read_bytes()
    destination = server.ROOT/'test-results/thread-benchmark'
    destination.mkdir(parents=True, exist_ok=True)
    report = {'input': str(Path(args.pdf).resolve()), 'sha256': hashlib.sha256(payload).hexdigest(),
              'cache': False, 'runs': []}
    signatures = []
    for threads in (1, args.threads):
        config = {**server.configuration(), 'recognition_threads': threads}
        with tempfile.TemporaryDirectory(prefix='sheetvis-threads-') as temporary:
            store = server.JobStore(temporary)
            try:
                with patch('server.configuration', return_value=config):
                    start = time.monotonic()
                    identifier = store.create(payload)
                    while True:
                        job = store.get(identifier)
                        if job['state'] in ('done','error'): break
                        time.sleep(.5)
                    elapsed = time.monotonic()-start
                log = (store.directory/identifier/'engine.log').read_text(errors='replace')
                (destination/f'{threads}-threads.log').write_text(log)
                if job['state'] != 'done': raise RuntimeError(job['message'])
                result = store.directory/identifier/job['results'][0]['name']
                signatures.append(signature(result))
                run = {'seconds':round(elapsed,3),'resources':job['resources'],'quality':job['quality'],
                       'pitched_notes':sum(1 for n in read_musicxml(result).findall('.//note') if n.find('pitch') is not None)}
                report['runs'].append(run)
                print(json.dumps(run,ensure_ascii=False),flush=True)
            finally:
                store.shutdown()
    report['same_note_timeline'] = signatures[0] == signatures[1]
    report['speedup'] = report['runs'][0]['seconds']/report['runs'][1]['seconds']
    (destination/'result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    if not report['same_note_timeline']: raise RuntimeError('Single and multi-thread exports differ; inspect logs.')
    print(f"Same note timeline; speedup {report['speedup']:.2f}x",flush=True)


if __name__ == '__main__': main()
