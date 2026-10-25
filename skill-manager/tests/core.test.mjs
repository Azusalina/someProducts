import { test } from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './fixture.mjs';
import { frontmatter } from '../src/scanner.mjs';
import { State } from '../src/state.mjs';
import { Actions, removalPlan } from '../src/actions.mjs';
import { Jobs, quote } from '../src/jobs.mjs';
import { createApp } from '../src/server.mjs';
const pause = ms => new Promise(r => setTimeout(r,ms));
async function settled(jobs,id) { for(let i=0;i<100;i++){ const job=jobs.get(id); if(job.finishedAt)return jobs.public(job); await pause(20); } throw new Error('job did not settle'); }
test('scan shared links, broken entries, projects, plugin ownership and install state', async t => {
  const f=await fixture(); t.after(f.cleanup); const r=await f.scanner.scan();
  const alpha=r.items.find(i=>i.name==='alpha'); assert.deepEqual(new Set(alpha.providers),new Set(['Shared','Claude'])); assert.equal(alpha.locations.length,2); assert.match(alpha.description,/multiple lines/);
  assert.equal(r.items.find(i=>i.name==='broken').status,'broken'); assert.equal(r.items.find(i=>i.name==='project-only').scope,'project'); assert.equal(r.items.find(i=>i.name==='system-skill').scope,'system');
  const missing=r.items.find(i=>i.name==='missing-plugin'); assert.equal(missing.status,'missing'); assert.equal(removalPlan(missing,f.scanner).type,'command'); assert.deepEqual(await f.scanner.documents(missing.id),[]);
  const demo=r.items.find(i=>i.name==='demo'); assert.equal(demo.status,'disabled'); assert.equal(r.items.find(i=>i.name==='review').owners[0],demo.id);
  const design=r.items.find(i=>i.name==='design'); assert.equal(design.status,'registered'); assert.equal(design.registrations.length,2); assert.equal(removalPlan(design,f.scanner).options.length,2); assert.equal(r.truncated,false);
});
test('malformed YAML is tolerated',()=>{assert.deepEqual(frontmatter('---\nname: [\n---\nbody'),{});assert.equal(frontmatter('---\nname: hello\n---\n').name,'hello');});
test('documents read references but reject traversal and symlink escapes',async t=>{
  const f=await fixture(); t.after(f.cleanup); await f.scanner.scan(); const i=f.scanner.items.find(i=>i.name==='alpha');
  assert((await f.scanner.documents(i.id)).includes('references/details.md')); assert(!(await f.scanner.documents(i.id)).includes('leak.md'));
  assert.match((await f.scanner.document(i.id,'references/details.md')).content,/Local reference/); await assert.rejects(f.scanner.document(i.id,'../../secret.md')); await assert.rejects(f.scanner.document(i.id,'leak.md'));
});
test('pin and appearance persist under concurrent writes',async t=>{
  const f=await fixture();t.after(f.cleanup);const dir=path.join(f.home,'state');const s=await new State(dir).load();
  await Promise.all([s.update(x=>x.pins.push('one')),s.update(x=>x.opacity=70),s.update(x=>x.roots.push('/tmp'))]);const loaded=await new State(dir).load();assert.deepEqual(loaded.data.pins,['one']);assert.equal(loaded.data.opacity,70);assert.deepEqual(loaded.data.roots,['/tmp']);
});
test('trash a shared symlink preserves its source; restore cannot overwrite files',async t=>{
  const f=await fixture();t.after(f.cleanup);await f.scanner.scan();const s=await new State(path.join(f.home,'state')).load();const a=new Actions(f.scanner,s);const i=f.scanner.items.find(i=>i.name==='alpha');const loc=i.locations.find(l=>l.symlink);
  const {key}=await a.trash(i.id,loc.id);await assert.rejects(fs.lstat(loc.path));assert(await fs.stat(i.realPath));await a.restore(key);assert((await fs.lstat(loc.path)).isSymbolicLink());
  const second=await a.trash(i.id,loc.id);await fs.mkdir(loc.path);await assert.rejects(a.restore(second.key),/已有/);assert((await fs.stat(loc.path)).isDirectory());
});
test('directories and dangling links recover; bundled skills use owner uninstall',async t=>{
  const f=await fixture();t.after(f.cleanup);await f.scanner.scan();const s=await new State(path.join(f.home,'state')).load();const a=new Actions(f.scanner,s);
  for(const name of ['project-only','broken']){ const i=f.scanner.items.find(i=>i.name===name);const {key}=await a.trash(i.id);await a.restore(key);assert(await fs.lstat(i.path)); }
  const i=f.scanner.items.find(i=>i.name==='review');assert.equal(removalPlan(i,f.scanner).type,'owner');await assert.rejects(a.trash(i.id));
});
test('commands stream output, report exit codes, accept input and cancel process groups',async t=>{
  const f=await fixture();t.after(f.cleanup);const j=new Jobs();t.after(()=>j.close());
  let job=await j.start("printf 'hello'; printf 'problem' >&2; exit 7",f.home);job=await settled(j,job.id);assert.equal(job.exitCode,7);assert.equal(job.status,'failed');assert.match(job.output,/hello/);assert.match(job.output,/problem/);
  job=await j.start('read -r answer; printf "answer=%s" "$answer"',f.home);j.input(job.id,'okay');job=await settled(j,job.id);assert.match(job.output,/answer=okay/);
  job=await j.start('sleep 30 & wait',f.home);await assert.rejects(j.start('true',f.home),/已有/);j.cancel(job.id);job=await settled(j,job.id);assert.equal(job.status,'cancelled');assert.equal(quote("a'b"),"'a'\\''b'");
});
test('HTTP enforces same origin, Host and tokens; escapes HTML and blocks remote images',async t=>{
  const f=await fixture();t.after(f.cleanup);const app=await createApp({scanner:f.scanner,dataDir:path.join(f.home,'state')});await new Promise((r,e)=>{app.server.once('error',e);app.server.listen(0,'127.0.0.1',r);});t.after(()=>new Promise(r=>{app.server.close(r);app.server.closeAllConnections();}));await app.ready;
  const base=`http://127.0.0.1:${app.server.address().port}`;const b=await(await fetch(base+'/api/bootstrap')).json();const headers={'X-Skill-Manager-Token':b.token,'Content-Type':'application/json'};
  assert.equal((await fetch(base+'/api/inventory')).status,403);assert.equal((await fetch(base+'/api/bootstrap',{headers:{Origin:'https://hostile.example'}})).status,403);assert.equal(await new Promise((resolve,reject)=>{const req=http.get(base+'/api/bootstrap',{headers:{Host:'hostile.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);}),403);
  const r=await(await fetch(base+'/api/inventory',{headers})).json();const alpha=r.items.find(i=>i.name==='alpha');const doc=await(await fetch(`${base}/api/document?id=${alpha.id}&file=SKILL.md`,{headers})).json();assert(!doc.html.includes('<script>'));assert(!doc.html.includes('<img'));assert(doc.html.includes('&lt;script&gt;'));
  assert.equal((await fetch(base+'/api/settings',{method:'POST',headers,body:JSON.stringify({opacity:101})})).status,400);
  const settings=await(await fetch(base+'/api/settings',{method:'POST',headers,body:JSON.stringify({opacity:43,theme:'dark'})})).json();assert.equal(settings.opacity,43);assert.equal(settings.theme,'dark');assert.equal((await fetch(base+'/api/document?id='+alpha.id+'&file=../../secret.md',{headers})).status,403);
});
