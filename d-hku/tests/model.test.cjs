const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const model=require('../model.js');
const data=JSON.parse(fs.readFileSync(new URL('../data/programmes.json',`file://${__filename}`),'utf8'));
const codes=data.programmes.map(p=>p.code);

test('2026 official examples independently calculated for the supplied profile',()=>{
  assert.deepEqual(model.summary(model.defaults),{best5:36.5,best6:40.5,business:44.3});
  for(const [code,score] of Object.entries({JS6298:54,JS6755:44.3,JS6767:44.3,JS6793:44.3,JS6810:40.5,JS6200:36.5,JS6224:36.5,JS6248:36.5,JS6729:41,JS6779:40.75,JS6999:36.5,JS6602:69.5})){
    const actual=model.score(code,model.defaults);assert.equal(actual.value,score,code);
    assert.ok(Math.abs(actual.terms.reduce((v,t)=>v+t.value,0)-score)<1e-9);
    assert.equal(new Set(actual.terms.map(t=>t.subject)).size,actual.terms.length);
  }
});
test('qualification gates are independent of a very high score',()=>{
  for(const code of ['JS6315','JS6377','JS6937']){assert.equal(model.score(code,model.defaults),null);assert.equal(model.eligibility(code,model.defaults).status,'removed');}
  assert.equal(model.eligibility('JS6810',model.defaults,'attained').status,'meets');
  assert.equal(model.eligibility('JS6810',{...model.defaults,english:'4'},'attained').status,'blocked');
  assert.equal(model.eligibility('JS6999',model.defaults).status,'meets');
  assert.equal(model.eligibility('JS6999',model.defaults,'unknown').status,'pending');
  assert.equal(model.eligibility('JS6999',model.defaults,'not').status,'blocked');
  assert.equal(model.eligibility('JS6224',model.defaults,'attained').status,'historical');
  assert.equal(model.eligibility('JS6729',{...model.defaults,m1:'3'},'attained').status,'blocked');
  assert.equal(model.eligibility('JS6602',{...model.defaults,ict:'3'},'attained').status,'blocked');
  assert.equal(model.eligibility('JS6793',{...model.defaults,ict:'2'},'attained').status,'blocked');
});
test('weighted selection handles six-subject bonus and alternate best subjects',()=>{
  const base=model.score('JS6755',model.defaults).value;
  assert.equal(model.score('JS6755',{...model.defaults,english:'4'}).value,base-2.25);
  assert.equal(model.score('JS6755',{...model.defaults,bafs:'5**'}).value,base+1.5);
  assert.equal(model.score('JS6298',{...model.defaults,ict:'U'}).value,49.5);
  for(const code of codes){const all=model.score(code,Object.fromEntries(Object.keys(model.defaults).map(k=>[k,'5**'])));assert.ok(Number.isFinite(all.value));}
});
test('import sanitises state and excludes historic route from live plan',()=>{
  const clean=model.cleanState({version:1,grades:{english:'5*+',chinese:'1'},plan:['JS6315','JS6377','JS6937','JS6224','JS6999','bad','JS6999'],compare:['JS6315',...codes,...codes],notes:{JS6999:'<img src=x>',bad:'ignored'},csd:'unknown'},codes);
  assert.deepEqual(clean.plan,['JS6999']);assert.equal(clean.compare.length,4);assert.equal(clean.grades.english,'5');assert.equal(clean.grades.chinese,'1');assert.equal(clean.csd,'attained');assert.equal(clean.version,2);assert.equal(clean.notes.JS6999,'<img src=x>');assert.ok(!Object.hasOwn(clean.notes,'bad'));
  assert.equal(model.cleanState({version:2,csd:'not'},codes).csd,'not');
  assert.throws(()=>model.cleanState(null,codes));
});
test('all 12 dossier records have the requested evidence fields and attributable sources',()=>{
  assert.equal(codes.length,12);assert.equal(new Set(codes).size,12);
  const sources=JSON.parse(fs.readFileSync(new URL('../data/sources.json',`file://${__filename}`),'utf8'));
  const ids=new Set(sources.map(s=>s.id));
  for(const p of data.programmes){
    for(const field of ['quota','eligibility','secondAs','secondWith','salary','advice'])assert.ok(typeof p[field]==='string'&&p[field].length>12,`${p.code} ${field}`);
    for(const field of ['curriculum','careers','postgraduate','reviews','sources','caveats'])assert.ok(p[field].length,`${p.code} ${field}`);
    for(const id of p.sourceIds)assert.ok(ids.has(id));
    for(const r of p.reviews){assert.ok(ids.has(r.sourceId));assert.ok(r.kind&&r.date&&r.summary&&r.url.startsWith('https://'));}
    assert.equal(p.admission2026.year,2026);
  }
});
test('2026 observed quartiles and current scores retain PDF provenance, ordering and historical caveats',()=>{
  const expected={JS6298:[44,45,47],JS6755:[37,38,38],JS6767:[40,41,42],JS6793:[35,35,37],JS6810:[36,38,39],JS6200:[35,35,37],JS6224:[31,32,34],JS6248:[34,34,35],JS6729:[36,36,38],JS6779:[36,36,37],JS6999:[32,33,34],JS6602:[52,53,55]};
  const hash=require('node:crypto').createHash('sha256').update(fs.readFileSync(new URL('../data/hku26.pdf',`file://${__filename}`))).digest('hex');
  assert.equal(data.profile.csd,'attained');
  for(const p of data.programmes){const b=p.admission2026;assert.deepEqual([b.lq,b.median,b.uq],expected[p.code]);assert.equal(b.sourceSha256,hash);assert.equal(b.source,'data/hku26.pdf');assert.equal(b.currentScoreAchieved,model.score(p.code,model.defaults).value);assert.ok(b.page>=1&&b.page<=5);assert.ok(b.formulaOriginal);assert.ok(!Object.hasOwn(b,'expected'));}
});
