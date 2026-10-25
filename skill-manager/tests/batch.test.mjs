import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fixture } from './fixture.mjs';
import { State } from '../src/state.mjs';
import { Actions } from '../src/actions.mjs';
import { Jobs } from '../src/jobs.mjs';
import { Batch } from '../src/batch.mjs';
import { createApp } from '../src/server.mjs';
const pause = ms => new Promise(r => setTimeout(r, ms));
async function setup(t) {
  const f = await fixture(); t.after(f.cleanup); await f.scanner.scan();
  const state = await new State(path.join(f.home, 'state')).load();
  const actions = new Actions(f.scanner, state), jobs = new Jobs(); t.after(() => jobs.close());
  return { ...f, state, actions, jobs, batch: new Batch(f.scanner, state, actions, jobs), find: name => f.scanner.items.find(i => i.name === name) };
}
async function finish(batch) { for (let i = 0; i < 300; i++) { if (batch.task.finishedAt) return batch.public(); await pause(20); } throw new Error('batch timeout'); }
test('batch plans preserve shared entry choices, plugin scopes and ownership; duplicate commands run once', async t => {
  const f = await setup(t), alpha = f.find('alpha'), demo = f.find('demo'), review = f.find('review'), design = f.find('design');
  const link = alpha.locations.find(l => l.symlink);
  let plan = f.batch.plan([{id:alpha.id,locationId:link.id},{id:review.id},{id:design.id,option:1}]);
  assert.equal(plan.rows[0].symlink,true);assert.equal(plan.rows[1].disposition,'blocked');assert.equal(plan.rows[2].cwd,path.join(f.home,'Documents/project'));assert.match(plan.rows[2].command,/--scope 'project'/);
  plan = f.batch.plan([{id:review.id},{id:demo.id}]);assert.equal(plan.rows[0].disposition,'covered');assert.equal(plan.executable,1);
  const clone = {...demo,id:'another-version',version:'2.0'};f.scanner.items.push(clone);
  plan = f.batch.plan([{id:demo.id},{id:clone.id}]);assert.equal(plan.executable,1);assert.equal(plan.rows[1].disposition,'covered');
  assert.throws(()=>f.batch.plan([{id:alpha.id,locationId:'invalid'}]));assert.throws(()=>f.batch.plan([{id:alpha.id},{id:alpha.id}]));
});
test('batch trash recovers each item and does not remove the target of a selected symlink', async t => {
  const f = await setup(t), alpha = f.find('alpha'), project = f.find('project-only');
  const selections = [{id:alpha.id,locationId:alpha.locations.find(l=>l.symlink).id},{id:project.id}];
  const plan = f.batch.plan(selections);await f.batch.start(selections,plan.fingerprint);const result = await finish(f.batch);
  assert.equal(result.results.filter(r=>r.status==='succeeded').length,2);assert(await fs.stat(alpha.realPath));
  for(const row of result.results)await f.actions.restore(row.trashKey);
  assert((await fs.lstat(alpha.locations.find(l=>l.symlink).path)).isSymbolicLink());assert(await fs.stat(project.path));
});
test('batch refuses changed review; later failure preserves earlier results and supports retry', async t => {
  const f = await setup(t), first = f.find('broken'), second = f.find('project-only');
  const selections=[{id:first.id},{id:second.id}];const plan=f.batch.plan(selections);
  await assert.rejects(f.batch.start(selections,'outdated'),/已变化/);assert(await fs.lstat(first.path));
  const trash=f.actions.trash.bind(f.actions);f.actions.trash=async(id,loc)=>{if(id===second.id)throw new Error('simulated permission failure');return trash(id,loc);};
  await f.batch.start(selections,plan.fingerprint);let result=await finish(f.batch);assert.deepEqual(result.results.map(r=>r.status),['succeeded','failed']);assert.match(result.results[1].error,/permission/);assert(await fs.stat(second.path));
  f.actions.trash=trash;const retry=[{id:second.id}], retryPlan=f.batch.plan(retry);await f.batch.start(retry,retryPlan.fingerprint);result=await finish(f.batch);assert.equal(result.results[0].status,'succeeded');
});
test('plugin batch uses reviewed CLI and working directory; stop cancels process group and skips later rows', async t => {
  const f = await setup(t), design=f.find('design'), project=f.find('project-only');
  const originalStart=f.jobs.start.bind(f.jobs), commands=[];
  f.jobs.start=(command,cwd)=>{commands.push({command,cwd});return originalStart('sleep 30',cwd);};
  const selections=[{id:design.id,option:1},{id:project.id}], plan=f.batch.plan(selections);await f.batch.start(selections,plan.fingerprint);
  for(let i=0;i<100&&!f.batch.task.jobId;i++)await pause(10);
  assert(f.batch.task.jobId);assert.equal(commands[0].cwd,path.join(f.home,'Documents/project'));assert.match(commands[0].command,/claude plugin uninstall 'design@official' --scope 'project'/);
  await assert.rejects(f.batch.start(selections,plan.fingerprint),/已有/);f.batch.cancel();const result=await finish(f.batch);
  assert.equal(result.status,'cancelled');assert.deepEqual(result.results.map(r=>r.status),['cancelled','skipped']);assert(await fs.stat(project.path));
});
test('bulk pin is atomic for invalid selections and preserves unrelated favorites', async t => {
  const f=await fixture();t.after(f.cleanup);const app=await createApp({scanner:f.scanner,dataDir:path.join(f.home,'state')});
  await new Promise((r,e)=>{app.server.once('error',e);app.server.listen(0,'127.0.0.1',r);});t.after(()=>new Promise(r=>{app.server.close(r);app.server.closeAllConnections();}));await app.ready;
  const base=`http://127.0.0.1:${app.server.address().port}`, b=await(await fetch(base+'/api/bootstrap')).json();const headers={'X-Skill-Manager-Token':b.token,'Content-Type':'application/json'};
  const post=async(route,data)=>{const r=await fetch(base+'/api/'+route,{method:'POST',headers,body:JSON.stringify(data)});return {status:r.status,data:await r.json()};};
  const ids=f.scanner.items.slice(0,3).map(i=>i.id);await post('pin',{id:ids[0],pinned:true});
  let r=await post('batch/pin',{selections:ids.slice(1).map(id=>({id})),pinned:true});assert.equal(r.data.pins.length,3);
  r=await post('batch/pin',{selections:[{id:ids[1]},{id:'missing'}],pinned:false});assert.equal(r.status,404);assert.equal(app.state.data.pins.length,3);
  r=await post('batch/pin',{selections:ids.slice(1).map(id=>({id})),pinned:false});assert.deepEqual(r.data.pins,[ids[0]]);
});
