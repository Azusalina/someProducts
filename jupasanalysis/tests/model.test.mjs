import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {simulate,codeFor} from '../model.mjs';
const base={months:18,horizon:10,salary:30000,after:40000,stipend:0,fundedMonths:0,tuition:300000,living:5000,discount:0};

test('half-year study end, opportunity cost, and first payback month',()=>{
  const r=simulate(base);
  assert.equal(r.work,3600000);
  assert.equal(r.study,3690000);
  assert.equal(r.netCost,930000);
  assert.equal(r.paybackMonth,111); // 18 months study + 93 months of 10k advantage.
  assert.equal(r.points.find(p=>p.month===18).study,-390000);
});
test('HKPFS funding stops after three years during a four-year PhD',()=>{
  const r=simulate({...base,months:48,horizon:4,stipend:28700,fundedMonths:36,tuition:0,living:0});
  assert.equal(r.study,1033200);
  assert.equal(r.netCost,406800);
  assert.equal(r.paybackMonth,null);
});
test('same salary after study cannot repay positive opportunity cost',()=>{
  assert.equal(simulate({...base,after:30000}).paybackMonth,null);
});
test('zero study time and identical wages have zero difference under discounting',()=>{
  const r=simulate({...base,months:0,tuition:0,living:0,after:30000,discount:5});
  assert.equal(r.difference,0);
  assert.ok(r.work<3600000);
});
test('invalid input cannot produce financial results',()=>{
  for(const bad of [{months:121},{fundedMonths:19},{discount:NaN},{salary:-1}])assert.throws(()=>simulate({...base,...bad}),RangeError);
});
test('all academic and salary references resolve, with correctly ordered bands',async()=>{
  const context={window:{}};vm.createContext(context);
  vm.runInContext(await readFile(new URL('../data.js',import.meta.url),'utf8'),context);
  const d=context.window.JUPAS_DATA;
  assert.equal(d.programmes.length,11);
  for(const list of ['sources','programmes','masters','research','roles'])assert.equal(new Set(d[list].map(x=>x.id)).size,d[list].length);
  const sourceIds=new Set(d.sources.map(s=>s.id));
  for(const s of d.sources)assert.equal(new URL(s.url).protocol,'https:');
  for(const p of d.programmes){assert.ok(sourceIds.has(p.source));for(const name of ['masters','research','roles'])for(const id of p[name])assert.ok(d[name].some(x=>x.id===id),`${p.id}: ${name}/${id}`);}
  for(const m of [...d.masters,...d.research])for(const id of m.sources)assert.ok(sourceIds.has(id));
  for(const r of d.roles){if(r.hk){assert.ok(r.hk[0]<=r.hk[1]&&r.hk[1]<=r.hk[2]);assert.ok(sourceIds.has(r.source));}if(r.us)assert.ok(sourceIds.has(r.usSource));}
  assert.equal(codeFor(d.programmes.find(p=>p.id==='applied'),'2027'),'6999');
  assert.equal(codeFor(d.programmes.find(p=>p.id==='applied'),'2026'),'6224');
});
