/* Bounded complex arithmetic, layered over the existing parsed expression tree. */
(function(root){
 'use strict';
 const make=(re,im=0)=>({re:re===0?0:re,im:im===0?0:im}),is=z=>!!z&&typeof z==='object'&&typeof z.re==='number'&&typeof z.im==='number',as=z=>is(z)?z:make(z),finite=z=>is(z)?Number.isFinite(z.re)&&Number.isFinite(z.im):Number.isFinite(z);
 const add=(a,b)=>{a=as(a);b=as(b);return make(a.re+b.re,a.im+b.im);},neg=a=>{a=as(a);return make(-a.re,-a.im);},mul=(a,b)=>{a=as(a);b=as(b);return make(a.re*b.re-a.im*b.im,a.re*b.im+a.im*b.re);};
 const div=(a,b)=>{a=as(a);b=as(b);const s=Math.max(Math.abs(b.re),Math.abs(b.im));if(!s)return make(NaN,NaN);const r=b.re/s,i=b.im/s,d=r*r+i*i;return make((a.re/s*r+a.im/s*i)/d,(a.im/s*r-a.re/s*i)/d);};
 const exp=z=>{z=as(z);const r=Math.exp(z.re);return make(r*Math.cos(z.im),r*Math.sin(z.im));},ln=z=>{z=as(z);return make(Math.log(Math.hypot(z.re,z.im)),Math.atan2(z.im,z.re));};
 const pow=(a,b)=>{a=as(a);b=as(b);if(a.re===0&&a.im===0&&b.im===0&&b.re>0)return make(0);if(b.im===0&&Number.isInteger(b.re)&&Math.abs(b.re)<=1024){let out=make(1),base=a,n=Math.abs(b.re);while(n){if(n%2)out=mul(out,base);base=mul(base,base);n=Math.floor(n/2);}return b.re<0?div(1,out):out;}return exp(mul(b,ln(a)));};
 const sqrt=z=>{z=as(z);const r=Math.hypot(z.re,z.im);return make(Math.sqrt((r+z.re)/2),(z.im<0?-1:1)*Math.sqrt((r-z.re)/2));};
 const sin=z=>{z=as(z);return make(Math.sin(z.re)*Math.cosh(z.im),Math.cos(z.re)*Math.sinh(z.im));},cos=z=>{z=as(z);return make(Math.cos(z.re)*Math.cosh(z.im),-Math.sin(z.re)*Math.sinh(z.im));};
 function enrich(entries,scope,M){
  const definitions=new Map();for(const e of entries)if(['variable','function'].includes(e.kind)&&!definitions.has(e.name))definitions.set(e.name,e);
  const active=new Set(),special=new Set(['re','im','arg','conj','complex']);
  function needs(node,seen=new Set()){let found=false;M.walk(node,n=>{if(n.type==='id'&&n.name==='i'||n.type==='call'&&special.has(n.name))found=true;const ref=definitions.get(n.name);if(ref&&!seen.has(ref)){seen.add(ref);if(ref.complex||needs(ref.ast,seen))found=true;else if(ref.kind==='variable'){try{const value=evaluate(ref.ast);if(is(value)&&value.im!==0)found=true;}catch{}}}});return found;}
  function evaluate(n,x=0,parameter='x',depth=0){
   if(depth>48)throw Error('复数表达式依赖过深');const ev=a=>evaluate(a,x,parameter,depth+1);
   if(n.type==='number')return n.value;
   if(n.type==='id'){
    if(n.name===parameter)return x;if(n.name==='i')return make(0,1);if(Object.hasOwn(M.constants,n.name))return M.constants[n.name];
    const ref=definitions.get(n.name);if(ref?.kind==='variable'){if(active.has(ref))throw Error('定义不能循环引用');active.add(ref);try{return evaluate(ref.ast,0,'x',depth+1);}finally{active.delete(ref);}}
    if(Number.isFinite(scope.vars[n.name]))return scope.vars[n.name];throw Error(`未定义复数变量 ${n.name}`);
   }
   if(n.type==='unary')return n.op==='+'?ev(n.arg):neg(ev(n.arg));
   if(n.type==='binary'){const a=ev(n.left),b=ev(n.right);switch(n.op){case '+':return add(a,b);case '-':return add(a,neg(b));case '*':return mul(a,b);case '/':return div(a,b);case '^':return pow(a,b);}throw Error('复数不支持此运算');}
   if(n.type!=='call')throw Error('复数关系暂不支持');
   const ref=definitions.get(n.name);if(ref?.kind==='function'){if(n.order||n.args.length!==1)throw Error('复数函数使用一个参数，暂不支持导数');if(active.has(ref))throw Error('定义不能循环引用');active.add(ref);try{return evaluate(ref.ast,ev(n.args[0]),ref.parameter,depth+1);}finally{active.delete(ref);}}
   if(n.order)throw Error('复数函数导数暂不支持');const args=n.args.map(ev),z=as(args[0]),scale=scope.angle==='deg'?Math.PI/180:1;
   if(['complex','pow','root'].includes(n.name)){if(args.length!==2)throw Error('需要两个参数');if(n.name==='complex'){if(args.some(a=>is(a)&&a.im!==0))throw Error('complex 的实部和虚部必须是实数');return make(as(args[0]).re,as(args[1]).re);}return n.name==='pow'?pow(...args):pow(args[0],div(1,args[1]));}
   if(args.length!==1)throw Error('复数函数需要一个参数');
   switch(n.name){case 're':return z.re;case 'im':return z.im;case 'arg':return Math.atan2(z.im,z.re);case 'conj':return make(z.re,-z.im);case 'abs':return Math.hypot(z.re,z.im);case 'sqrt':return sqrt(z);case 'exp':return exp(z);case 'ln':return ln(z);case 'log':case 'log10':return div(ln(z),Math.LN10);case 'log2':return div(ln(z),Math.LN2);case 'sin':return sin(mul(z,scale));case 'cos':return cos(mul(z,scale));case 'tan':return div(sin(mul(z,scale)),cos(mul(z,scale)));case 'sinh':return div(add(exp(z),neg(exp(neg(z)))),2);case 'cosh':return div(add(exp(z),exp(neg(z))),2);case 'tanh':return div(add(exp(z),neg(exp(neg(z)))),add(exp(z),exp(neg(z))));}
   if(z.im===0&&typeof Math[n.name]==='function')return Math[n.name](z.re);throw Error(`暂不支持复数 ${n.name}`);
  }
  for(const e of entries){
   if(!e.ast||e.error&&/已经定义|循环/.test(e.error))continue;const required=needs(e.ast),candidate=['value','variable'].includes(e.kind)&&(!Number.isFinite(e.value)&&e.kind==='value'||!!e.error);
   if(!required&&!candidate)continue;
   try{const value=evaluate(e.ast,0,e.parameter||'x');if(!required&&(!is(value)||value.im===0))continue;if(['value','variable'].includes(e.kind)&&!finite(value))throw Error('复数结果未定义');if(e.restriction)throw Error('复数表达式暂不支持定义域限制');
    e.error=undefined;e.complex=is(value);e.slider=false;e.step=false;e.discrete=false;e.integral=null;e.distribution=null;e.fn=x=>{try{return evaluate(e.ast,x,e.parameter||'x');}catch{return make(NaN,NaN);}};e.df=()=>NaN;
    if(['value','variable'].includes(e.kind)){e.value=value;e.complexScalar=true;}
   }catch(error){if(required)e.error=error.message;}
  }
 }
 const api={make,is,finite,add,mul,div,pow,sqrt,exp,ln,enrich};root.GraphComplex=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
