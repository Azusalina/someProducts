import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../js/math.js';
import { lessons } from '../js/lessons.js';
const near=(actual,expected,tolerance=1e-9)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} should be near ${expected}`);

test('vector length, addition, and orthogonal residual agree with worked examples',()=>{
  assert.equal(m.norm([3,4]),5);assert.deepEqual(m.add([1,0],[0,2]),[1,2]);
  const v=[3,2],u=[1,0],p=m.projection(v,u);
  assert.deepEqual(p,[3,0]);near(m.dot(m.add(v,m.scale(p,-1)),u),0);
  assert.equal(m.projection(v,[0,0]),null);
});
test('matrix multiplication preserves composition and the example is noncommutative',()=>{
  const A=[2,0,0,1],B=[0,-1,1,0],v=[1,1];
  assert.deepEqual(m.transform(m.multiply(A,B),v),[-2,1]);
  assert.deepEqual(m.transform(m.multiply(B,A),v),[-1,2]);
  assert.equal(m.det([1,2,2,4]),0);
});
test('system classification handles intersections, inconsistent rows, and all-zero constraints',()=>{
  assert.deepEqual(m.solve([1,1,1,-1],[3,1]),{kind:'unique',x:[2,1]});
  assert.equal(m.solve([1,1,2,2],[2,5]).kind,'none');
  assert.equal(m.solve([1,1,2,2],[2,4]).kind,'infinite');
  assert.equal(m.solve([0,0,0,0],[0,0]).kind,'infinite');
  assert.equal(m.solve([0,0,0,0],[0,1]).kind,'none');
  assert.equal(m.solve([1,0,0,0],[2,1]).kind,'none');
});
test('real eigenvalues distinguish stretch from a 90-degree rotation',()=>{
  assert.deepEqual(m.eigenvalues([2,0,0,1]),[2,1]);
  assert.equal(m.eigenvalues([0,-1,1,0]),null);
  assert.deepEqual(m.eigenvalues([1,1,0,1]),[1,1]);
});
test('sample and population variance match their denominators',()=>{
  const xs=[2,4,4,6,9];assert.equal(m.mean(xs),5);assert.equal(m.median(xs),4);
  assert.equal(m.variance(xs),7);assert.equal(m.variance(xs,false),5.6);
  assert.equal(m.median([1,4,7,10]),5.5);assert.ok(Number.isNaN(m.variance([1])));
});
test('least squares matches known coefficients and residual orthogonality',()=>{
  const fit=m.regression([[1,2],[2,3],[3,5]]);
  near(fit.intercept,1/3);near(fit.slope,1.5);near(fit.sse,1/6);
  near(fit.residuals.reduce((a,b)=>a+b,0),0);
  near(fit.residuals.reduce((sum,r,i)=>sum+r*(i+1),0),0);
  assert.equal(m.regression([[1,2],[1,3]]),null);
  assert.equal(m.regression([[1,2],[2,2]]).r2,null);
});
test('normal areas and binomial probabilities match known results and sum to one',()=>{
  near(m.normalCDF(0),.5,1e-7);
  near(m.normalCDF(1)-m.normalCDF(-1),.68268949,1e-6);
  near(m.normalCDF(130,100,15)-m.normalCDF(70,100,15),.95449974,1e-6);
  near(m.binomialPMF(3,.5)[2],3/8);
  for(const n of [1,10,30])for(const p of [0,.01,.5,.99,1])near(m.binomialPMF(n,p).reduce((a,b)=>a+b,0),1,1e-10);
  assert.deepEqual(m.binomialPMF(3,0),[1,0,0,0]);assert.deepEqual(m.binomialPMF(3,1),[0,0,0,1]);
});
test('histogram conserves counts including the upper edge and constant data',()=>{
  const xs=[0,1,2,3,4],h=m.histogram(xs,4);assert.equal(h.counts.reduce((a,b)=>a+b,0),5);
  assert.deepEqual(h.counts,[1,1,1,2]);
  assert.equal(m.histogram([4,4,4],5).counts.reduce((a,b)=>a+b,0),3);
});
test('bootstrap resamples observed values and has reproducible finite quantiles',()=>{
  const xs=[2,4,4,6,9],a=m.bootstrap(xs,1000,m.seededRandom(42)),b=m.bootstrap(xs,1000,m.seededRandom(42));
  assert.deepEqual(a,b);assert.ok(a.every(x=>x>=2&&x<=9));
  assert.ok(m.quantile(a,.025)<m.mean(xs));assert.ok(m.quantile(a,.975)>m.mean(xs));
  assert.equal(m.quantile([1,2,3,4],.5),2.5);
});
test('repeated normal samples have the predicted mean standard error and coverage',()=>{
  const random=m.seededRandom(42),n=40,se=1/Math.sqrt(n);
  const means=Array.from({length:5000},()=>m.mean(Array.from({length:n},()=>m.randomNormal(random))));
  near(m.mean(means),0,.015);near(Math.sqrt(m.variance(means)),se,.01);
  const coverage=means.filter(x=>Math.abs(x)<=1.96*se).length/means.length;
  near(coverage,.95,.02);
});
test('course references and bilingual examples are complete',()=>{
  assert.equal(lessons.length,14);assert.equal(new Set(lessons.map(l=>l.id)).size,14);
  assert.equal(lessons.filter(l=>l.group==='Linear algebra').length,8);
  for(const l of lessons){assert.ok(l.py&&l.r&&l.ref&&l.formula);assert.ok(l.idea.zh&&l.idea.en);assert.ok(l.quiz.options[l.quiz.answer]);}
});
