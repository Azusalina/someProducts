const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../math.js'),P=require('../plot.js');
function build(...texts){return M.build(texts.map((text,i)=>({id:i+1,text,visible:true,color:'#376ca3'})));}
function last(...texts){return build(...texts).entries.at(-1);}
function close(actual,expected,tol=1e-7){assert.ok(Math.abs(actual-expected)<tol,`${actual} != ${expected}`);}
test('power precedence, implicit multiplication, Unicode and exponent notation',()=>{
  for(const [s,v]of [['-2^2',-4],['2^3^2',512],['2^-2',.25],['2(3+1)',8],['2pi',2*Math.PI],['π²',Math.PI**2],['1e-3',.001],['3×2−1',5]])close(last(s).value,v);
  close(last('a=2','a(x+1)').fn(3),8);
});
test('forward references and live variable dependencies',()=>{
  const m=build('f(t)=a sin(t)','b=a+1','a=2','g(x)=f(x)+b','g(pi/2)');
  m.entries.forEach(e=>assert.equal(e.error,undefined));close(m.entries.at(-1).value,5);
  close(m.entries[0].df(0),2);
});
test('missing, duplicate and cyclic definitions produce local errors',()=>{
  assert.match(last('f(x)=g(x)','g(x)=f(x)').error,/循环|无效/);
  assert.match(last('a=b','b=a').error,/循环/);
  assert.match(last('a=2','a=3').error,/已经定义/);
  assert.match(last('z*x').error,/未定义/);
  assert.match(last('f(x)=unknown(x)','f(x)').error,/无效/);
  assert.match(last('a=unknown(1)','a*x').error,/无效/);
  assert.match(last('sqrt()').error,/参数/);
});
test('analytic first derivative uses chain, product, quotient and power rules',()=>{
  for(const [s,x,expected]of [['x^3-3x',2,9],['sin(x^2)',.3,.6*Math.cos(.09)],['exp(x)*ln(x)',2,Math.exp(2)*(Math.log(2)+.5)],['(x+1)/(x-1)',3,-.5],['x^x',2,4*(Math.log(2)+1)],['2^x',3,8*Math.LN2],['x^0',0,0],['atan2(x,2)',1,.4]]){
    const e=last(`f(x)=${s}`,"f'(x)");assert.equal(e.error,undefined);close(e.fn(x),expected);
  }
});
test('derivatives preserve real domains and reject cusps',()=>{
  for(const s of ['ln(x)','sqrt(x)','asin(x)']){const e=last(`f(x)=${s}`,"f'(x)");assert.ok(Number.isNaN(e.fn(s==='asin(x)'?2:-1)));}
  assert.ok(Number.isNaN(last('f(x)=abs(x)',"f'(x)").fn(0)));
  assert.ok(Number.isNaN(last('diff(ln(x))').fn(-1)));
  close(last('f(x)=x^3',"f''(x)").fn(2),12,1e-5);
  close(last('f(x)=x^2',"f'(2)").value,4);
});
test('degree mode differentiates with the angle scale',()=>{
  const m=M.build([{text:'f(x)=sin(x)'},{text:"f'(x)"}],'deg');close(m.entries[0].fn(90),1);close(m.entries[1].fn(0),Math.PI/180);
});
test('integrals: definite, accumulation, negative bounds and FTC',()=>{
  close(last('f(x)=x^2','int(f(x),0,3)').value,9);
  close(last('f(x)=sin(x)','integral(f,0,pi)').value,2);
  close(last('int(x^2,3,0)').value,-9);
  close(last('f(x)=x^2','int f(x) dx').fn(3),9);
  close(last('f(x)=sin(x)','F(x)=int(f(x),0,x)',"F'(x)").fn(.5),Math.sin(.5));
  close(M.integrate(x=>Math.exp(-x*x),-1,1),1.493648265624854,1e-7);
});
test('singular, nonfinite and unconverged integrals are undefined',()=>{
  assert.ok(Number.isNaN(M.integrate(x=>1/x,-1,1)));
  assert.ok(Number.isNaN(M.integrate(x=>1/(x-.1234567)**2,0,1)));
  assert.ok(Number.isNaN(M.integrate(Math.log,0,1)));
  assert.ok(Number.isNaN(M.integrate(x=>x,0,Infinity)));
  close(M.integrate(x=>x,2,2),0);
  assert.match(last('int(int(x),0,2)').error,/嵌套/);
  assert.match(last('f(x)=int(x)','int(f(x),0,2)').error,/嵌套/);
});
test('definitions and graph rows enforce restrictions and chains',()=>{
  const e=last('x^2{-2<x<2}');assert.equal(e.allowed(-3,9),false);assert.equal(e.allowed(0,0),true);assert.equal(e.allowed(2,4),false);
  const f=last('f(x)=x^2{x>0}',"f'(x)");assert.equal(f.fn(2),4);assert.ok(Number.isNaN(f.fn(-1)));
  const t=last('f(t)=t^2{t>=0}',"f'(x)");assert.equal(t.fn(2),4);assert.ok(Number.isNaN(t.fn(0)));
});
test('classifies vertical, implicit, inequality and points',()=>{
  assert.equal(last('x=2').kind,'vertical');
  const e=last('x=2y');assert.equal(e.kind,'implicit');close(e.fn(4,2),0);
  close(last('x^2+y^2=9').fn(3,0),0);
  assert.equal(last('y<x^2').kind,'inequality');
  assert.deepEqual(last('(2,3)').point,[2,3]);
});
test('lexer rejects code injection and bounded parser rejects deep input',()=>{
  for(const s of ['globalThis.alert(1)','constructor(1)','x; process.exit()','[1,2]','"hi"','x'.repeat(601),'('.repeat(60)+'1'+')'.repeat(60)])assert.ok(last(s).error,s);
});
test('adaptive sampling does not bridge a pole',()=>{
  const view={cx:.13,cy:0,scale:50},width=900,height=600;
  const samples=P.sampleCurve(x=>1/x,view,width,height);
  assert.ok(samples.segments.length>=2);
  for(const segment of samples.segments){assert.ok(!(segment.some(p=>p.x<0)&&segment.some(p=>p.x>0)));}
  const smooth=P.sampleCurve(Math.sin,view,width,height);assert.equal(smooth.segments.length,1);assert.ok(smooth.evaluations<2000);
});
test('contours interpolate a circle and reject a pole',()=>{
  const circle=P.contourCell((x,y)=>x*x+y*y-1,.9,0,.2,.2,(x,y)=>[x,y]);assert.equal(circle.length,1);
  const vertex=P.contourCell((x,y)=>x*x+y*y-1,.6,.7,.1,.1,(x,y)=>[x,y]);assert.equal(vertex.length,1,'circle crossing an exact grid vertex remains connected');
  const pole=P.contourCell(x=>1/x,-.1,0,.2,.2,(x,y)=>[x,y]);assert.equal(pole.length,0);
});
test('named points accept numeric and parameter coordinates and round-trip through LaTeX',()=>{
 const L=require('../latex.js');const m=build('t=2','a=(t,t^2)');assert.equal(m.entries[1].error,undefined);assert.equal(m.entries[1].name,'a');assert.deepEqual(m.entries[1].point,[2,4]);const tex=L.toLatex('a=(1,2)');const e=last(tex);assert.equal(e.kind,'point');assert.equal(e.name,'a');assert.deepEqual(e.point,[1,2]);assert.deepEqual(last('a=(sin(pi/2),2)').point,[1,2]);
});
test('point definitions reject duplicate names and nonfinite or unbound coordinates',()=>{
 assert.match(last('a=(1,2)','a=3').error,/已经定义/);assert.match(last('a=3','a=(1,2)').error,/已经定义/);assert.match(last('a=(1/0,2)').error,/有限/);assert.match(last('a=(x,y)').error,/参数/);
});

test('n(n,r) and p(n,r) compute combinations and permutations with exact integer intermediates',()=>{
 for(const [text,value]of [['n(5,2)',10],['p(5,2)',20],['n(0,0)',1],['p(0,0)',1],['n(20,20)',1],['p(10,10)',3628800],['n(1000,2)',499500],['n(52,5)',2598960],['n(1000,998)',499500]]){const e=last(text);assert.equal(e.error,undefined,text);assert.equal(e.value,value,text);}
 assert.equal(last('n=8','r=3','n(n,r)').value,56);assert.equal(last('n=8','r=3','p(n,r)').value,336);assert.equal(last('n(5,2)+p(5,2)').value,30);assert.equal(last('n(5,2)*x').fn(3),30);
 for(const text of ['n(-1,0)','p(5,-1)','n(3,4)','p(4,1.5)','n(9007199254740992,1)'])assert.ok(Number.isNaN(last(text).value),text);
 assert.equal(last('n(2000,1000)').value,Infinity);assert.equal(last('p(1000,999)').value,Infinity);
});
test('combinatoric calls coexist with normal distribution aliases and lowercase event probability',()=>{
 const m=build('X~n(0,1)','p(X=2)','n(5,2)','p(5,2)','pdf(n(0,1),0)');m.entries.forEach(e=>assert.equal(e.error,undefined));assert.equal(m.entries[0].distribution.family,'normal');assert.equal(m.entries[1].value,0);assert.equal(m.entries[2].value,10);assert.equal(m.entries[3].value,20);close(m.entries[4].value,1/Math.sqrt(2*Math.PI));
 const hints=build('n=5','r=2','n(n,r)').parameterHints;assert.equal(hints.r,undefined);
});
