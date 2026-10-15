const {test}=require('node:test'),assert=require('node:assert/strict');
const S=require('../stats.js'),M=require('../math.js'),P=require('../plot.js'),L=require('../latex.js');
const close=(a,b,tol=1e-10)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
const build=(...texts)=>M.build(texts.map((text,i)=>({text,id:i+1})));
const last=(...texts)=>{const e=build(...texts).entries.at(-1);assert.equal(e.error,undefined);return e;};
test('Poisson PMF, CDF, inclusive probability and degenerate limits',()=>{
 const d=S.create('poisson',[4]);close(d.pmf(0),Math.exp(-4));close(d.pmf(3),Math.exp(-4)*4**3/6);close(d.cdf(3.9),[0,1,2,3].reduce((s,k)=>s+d.pmf(k),0));close(d.interval(1.2,3.9),d.pmf(2)+d.pmf(3));close(S.sum(d.pmf,0,80),1);assert.equal(d.pmf(1.5),0);assert.equal(d.cdf(-1),0);assert.equal(d.cdf(Infinity),1);assert.equal(d.interval(3,2),0);
 const zero=S.create('poisson',[0]);assert.equal(zero.pmf(0),1);assert.equal(zero.pmf(1),0);assert.equal(zero.cdf(0),1);assert.ok(Number.isNaN(d.cdf(NaN)));
});
test('binomial normalization, CDF, endpoint and large parameter stability',()=>{
 const d=S.create('binomial',[10,.3]);close(d.pmf(3),.2668279319999998);close(d.cdf(4.5),S.sum(d.pmf,0,4));close(S.sum(d.pmf,0,10),1);assert.equal(d.pmf(11),0);
 for(const p of [0,1]){const b=S.create('binomial',[10,p]);assert.equal(b.pmf(p*10),1);assert.equal(b.cdf(9),p===0?1:0);assert.equal(b.cdf(10),1);}
 const big=S.create('binomial',[1e6,.5]);assert.ok(big.peak>0&&big.peak<.001);close(big.cdf(499999)+big.cdf(500000),1,2e-8);const poisson=S.create('poisson',[1e6]);assert.ok(poisson.peak>0);assert.ok(poisson.cdf(1e6)>.49&&poisson.cdf(1e6)<.51);
});
test('continuous density, cumulative and interval functions',()=>{
 const normal=S.create('normal',[]);close(normal.pdf(0),1/Math.sqrt(2*Math.PI));close(normal.cdf(0),.5);close(normal.interval(-1,1),.682689492137,2e-7);close(normal.cdf(-Infinity),0);close(normal.cdf(Infinity),1);
 const uniform=S.create('uniform',[2,6]);close(uniform.pdf(4),.25);close(uniform.cdf(4),.5);assert.equal(uniform.pdf(1),0);close(uniform.interval(3,5),.5);
 const exp=S.create('exponential',[2]);close(exp.pdf(1),2*Math.exp(-2));close(exp.cdf(1),1-Math.exp(-2));assert.equal(exp.cdf(-1),0);close(exp.interval(0,1),1-Math.exp(-2));
});
test('invalid parameters, bounded sum and step integration',()=>{
 for(const [n,a]of [['poisson',[-1]],['poisson',[Infinity]],['binomial',[1.5,.5]],['binomial',[2,1.1]],['normal',[0,0]],['uniform',[2,2]],['exponential',[0]]])assert.throws(()=>S.create(n,a));
 assert.ok(Number.isNaN(S.sum(x=>x,0,30000)));close(S.sum(x=>x,2,4),9);const f=x=>Math.floor(x);close(S.integrateStep(f,-.5,2.5),1.5);close(S.integrateStep(f,2.5,-.5),-1.5);
});
test('distribution notation, aliases, object methods and LaTeX round trip',()=>{
 const m=build('lambda=4','X~poisson(lambda)','p=poisson(lambda)','p.pdf(2)','p.cdf(2)');m.entries.forEach(e=>assert.equal(e.error,undefined));assert.equal(m.entries[1].discrete,true);assert.equal(m.entries[2].slider,false);close(m.entries[3].value,S.create('poisson',[4]).pmf(2));close(m.entries[4].value,S.create('poisson',[4]).cdf(2));assert.equal(m.parameterHints.lambda.min,0);
 for(const s of ['x~poisson(lambda)','pdf(normal(0,1),x)','pmf(binomial(8,.4),x)','cdf(poisson(4),x)'])assert.deepEqual(M.classify(L.toLatex(s)).ast,M.classify(s).ast);
 assert.equal(last('poissondist(4)').kind,'distribution');assert.equal(last('pmf(poisson(4),x)').discrete,true);assert.equal(last('cdf(poisson(4),x)').step,true);assert.equal(last('pdf(normal(0,1),x)').discrete,false);
});
test('d/dx and independent constant definitions retain calculus behavior',()=>{
 for(const s of ['d/dx(x^3)','d/dx x^3','(d/dx)(x^3)','\\frac{d}{dx}x^3'])close(last(s).fn(2),12);
 close(last('f(x)=sinx','d/dx f(x)').fn(1),Math.cos(1));assert.equal(last('a=pi/2').slider,true);assert.equal(last('a=2','b=a+1').slider,false);
});
test('discrete functions are sampled at integers and calculus avoids false continuous areas',()=>{
 const e=last('discrete(x^2)');assert.equal(e.fn(2),4);assert.ok(Number.isNaN(e.fn(2.5)));const samples=P.sampleDiscrete(e.fn,{cx:0,cy:1,scale:40,yScale:100},400,300);assert.ok(samples.points.every(p=>Number.isInteger(p.x)));assert.ok(samples.points.some(p=>p.x===2&&p.py===-150));
 assert.equal(last('p(t)=pmf(poisson(4),t)','2*p(x)').discrete,true);assert.match(build('int(pmf(poisson(4),x),0,3)').entries[0].error,/离散/);assert.match(build('pmf(normal(0,1),x)').entries[0].error,/连续/);assert.match(build('pmf(poisson(4),2x)').entries[0].error,/横坐标/);
 const cdf=S.create('poisson',[4]).cdf;close(last('int(cdf(poisson(4),x),0,3)').value,cdf(.5)+cdf(1.5)+cdf(2.5));
});
test('named random variables support exact event probability and forward references',()=>{
 const m=build('P(X=2)','lambda=4','X~poisson(lambda)','n=3','P(X=n)','p=P(X=2)');m.entries.forEach(e=>assert.equal(e.error,undefined));close(m.entries[0].value,S.create('poisson',[4]).pmf(2));close(m.entries[4].value,S.create('poisson',[4]).pmf(3));close(m.scope.vars.p,m.entries[0].value);
 close(last('x~poisson(4)','P(x=2)').value,S.create('poisson',[4]).pmf(2));close(build('x~poisson(4)','p=P(x=2)').scope.vars.p,S.create('poisson',[4]).pmf(2));close(last('X~poisson(4)','P(X=2.5)').value,0);close(last('X~normal(0,1)','P(X=0)').value,0);assert.match(build('P(Y=2)').entries[0].error,/先定义/);assert.ok(build('X~poisson(4)','P(X=X)').entries[1].error);assert.ok(build('X~poisson(4)','X~poisson(2)').entries[1].error);
});
test('n and normal use mean and variance; lowercase p accepts events without breaking p values',()=>{
 const a=S.create('n',[3,4]),b=S.create('normal',[3,4]);close(a.pdf(3),1/(2*Math.sqrt(2*Math.PI)));close(a.cdf(5),.841344746,2e-7);close(a.pdf(4),b.pdf(4));
 const m=build('mu=3','sd=2','X~n(mu,sd^2)','p(X=3)','P(X=3)');m.entries.forEach(e=>assert.equal(e.error,undefined));close(m.entries[2].fn(3),a.pdf(3));close(m.entries[3].value,0);close(m.entries[4].value,0);
 close(last('X~poisson(4)','p(X=2)').value,S.create('poisson',[4]).pmf(2));close(last('p=0.3','pdf(binomial(5,p),2)').value,S.create('binomial',[5,.3]).pmf(2));assert.equal(last('n=3').slider,true);
});
