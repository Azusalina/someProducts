/* graphVis expression engine. No eval, code generation, network or dependencies. */
(function (root) {
  'use strict';
  const S=root.GraphStats||(typeof require==='function'?require('./stats.js'):null);
  const C=root.GraphComplex||(typeof require==='function'?require('./complex.js'):null);
  const constants = Object.freeze({ pi: Math.PI, e: Math.E, tau: 2 * Math.PI });
  const arities = {sin:1,cos:1,tan:1,asin:1,acos:1,atan:1,sinh:1,cosh:1,tanh:1,sqrt:1,cbrt:1,abs:1,exp:1,ln:1,log:1,log10:1,log2:1,floor:1,ceil:1,round:1,sign:1,min:2,max:2,pow:2,root:2,atan2:2};
  const reserved = new Set([...Object.keys(constants), ...Object.keys(arities), 'x', 'y', 'int', 'integral', 'diff','sum','segment','i','re','im','arg','conj','complex','pdf','pmf','cdf','discrete','P']);
  const unaryNames=Object.keys(arities).filter(k=>arities[k]===1).sort((a,b)=>b.length-a.length);
  const num = value => ({type:'number', value});
  function normalize(s) {
    s=s.replace(/(?<!\\)\bint\s+(?!\()/g,'\\int ');
    if(s.includes('\\')||/[\^_]\s*\{/.test(s)){const latex=root.GraphLatex||(typeof require==='function'?require('./latex.js'):null);s=latex.toPlain(s);}
    s = s.trim().replace(/[−–]/g,'-').replace(/[×·]/g,'*').replace(/÷/g,'/').replace(/π/g,'pi').replace(/≤/g,'<=').replace(/≥/g,'>=').replace(/²/g,'^2').replace(/³/g,'^3').replace(/[′’]/g,"'").replace(/√\s*\(/g,'sqrt(');
    // d/dx binds the following bracketed expression or powered/function atom.
    s=s.replace(/\(\s*d\s*\/\s*dx\s*\)\s*(?=\()/g,'diff').replace(/\bd\s*\/\s*dx\s*(?=\()/g,'diff').replace(/\bd\s*\/\s*dx\s+(\w+(?:\([^()]*\))?(?:\^[+-]?\d+)?)/g,'diff($1)');
    const integral = s.match(/^(?:int|∫)\s+(.+?)\s*d[x]\s*$/);
    if (integral) s = `int(${integral[1]})`;
    return s;
  }
  function tokenize(s) {
    if (s.length > 600) throw Error('表达式最多 600 字符');
    const result = []; let i = 0;
    while (i < s.length) {
      if (/\s/.test(s[i])) { i++; continue; }
      const rest = s.slice(i);
      const n = rest.match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
      if (n) { result.push({type:'number', value:Number(n[0])}); i += n[0].length; continue; }
      const id = rest.match(/^[A-Za-z][A-Za-z0-9_]*/);
      if (id) {
        const prefix=unaryNames.find(k=>id[0].startsWith(k)&&id[0].length>k.length&&/^(?:[xytabe]|(?:sin|cos|tan)[xyt])$/.test(id[0].slice(k.length)));
        const value=prefix||(/^i[xy]$/.test(id[0])?'i':id[0]);result.push({type:'id',value});i+=value.length;continue;
      }
      const op = rest.match(/^(<=|>=|!=|==|&&|\|\||[+\-*/^(),.<>=!'{}~])/);
      if (!op) throw Error(`无法识别「${s[i]}」`);
      result.push({type:op[0], value:op[0]}); i += op[0].length;
    }
    result.push({type:'end'}); return result;
  }
  function parse(source) {
    const tokens = tokenize(normalize(source)); let index = 0, depth = 0;
    const peek = () => tokens[index];
    const take = type => { if (peek().type !== type) throw Error(`需要「${type}」`); return tokens[index++]; };
    function expression(min = 0) {
      if (++depth > 48) throw Error('表达式嵌套过深');
      let node, t = tokens[index++];
      if (t.type === 'number') node = num(t.value);
      else if (t.type === '+' || t.type === '-') node = {type:'unary',op:t.type,arg:expression(25)};
      else if (t.type === '(') {
        node = expression();
        if (peek().type === ',') { index++; node = {type:'point',args:[node,expression()]}; }
        take(')');
      } else if (t.type === 'id') {
        let order = 0; while (peek().type === "'") { index++; order++; }
        if (order > 2) throw Error('目前支持一阶、二阶导数');
        let functionPower=null;
        if(arities[t.value]===1&&peek().type==='^'){index++;functionPower=peek().type==='id'?{type:'id',name:tokens[index++].value}:expression(31);}
        if (peek().type === '(') {
          index++; const args = [];
          if (peek().type !== ')') { do { args.push(expression()); if (peek().type !== ',') break; index++; } while (true); }
          take(')');if(t.value==='sum'&&[2,3].includes(args.length)&&args[0].type==='compare'&&args[0].ops.length===1&&args[0].ops[0]==='='&&args[0].args[0].type==='id'){const [index,lower]=args[0].args;const upper=args[1],body=args[2]||index;args.splice(0,args.length,body,index,lower,upper);}node = {type:'call',name:t.value,order,args};
        } else if(arities[t.value]===1&&!order){node={type:'call',name:t.value,order:0,args:[expression(25)]};}
        else {
          if (order) throw Error("导数写作 f'(x)");
          node = {type:'id',name:t.value};
        }
        if(functionPower)node={type:'binary',op:'^',left:node,right:functionPower};
      } else throw Error(t.type === 'end' ? '请输入完整表达式' : `这里不能使用「${t.value}」`);
      while (true) {
        if(peek().type==='.'){
          index++;const method=take('id').value;if(!['pdf','pmf','cdf'].includes(method))throw Error('未知分布方法');take('(');const arg=expression();take(')');node={type:'call',name:method,order:0,args:[node,arg]};continue;
        }
        t = peek(); let op = t.type, power = {'||':2,'&&':3,'=':5,'==':5,'!=':5,'<':5,'>':5,'<=':5,'>=':5,'+':10,'-':10,'*':20,'/':20,'^':30}[op];
        const implicit = t.type === 'number' || t.type === 'id' || t.type === '(';
        if (implicit) { op = '*'; power = 20; }
        if (power === undefined || power < min) break;
        if (!implicit) index++;
        const right = expression(op === '^' ? power : power + 1);
        if (power === 5 && node.type === 'compare') { node.args.push(right); node.ops.push(op); }
        else if (power === 5) node = {type:'compare',args:[node,right],ops:[op]};
        else node = {type:'binary',op,left:node,right};
      }
      depth--; return node;
    }
    const result = expression(); take('end'); return result;
  }
  function walk(node, visit) {
    visit(node);
    for (const child of node.args || []) walk(child,visit);
    for (const key of ['left','right','arg']) if (node[key]) walk(node[key],visit);
  }
  function probabilityNames(ast){const excluded=new Set();walk(ast,n=>{if(n.type==='call'&&['P','p'].includes(n.name)&&n.args[0]?.type==='compare')excluded.add(n.args[0].args[0]);});return excluded;}
  function integrate(fn, a, b, tolerance = 1e-7, maxDepth = 13) {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
    if (a === b) return 0;
    if (b < a) return -integrate(fn,b,a,tolerance,maxDepth);
    let evaluations = 0;
    const value = x => { if (++evaluations > 8192) return NaN; return fn(x); };
    const fa = value(a), fb = value(b), m = (a+b)/2, fm = value(m);
    if (![fa,fb,fm].every(Number.isFinite)) return NaN;
    function step(l,r,fl,fr,fc,whole,tol,depth) {
      const mid = (l+r)/2, f1 = value((l+mid)/2), f2 = value((mid+r)/2);
      if (!Number.isFinite(f1) || !Number.isFinite(f2)) return NaN;
      const left = (mid-l)*(fl+4*f1+fc)/6, right = (r-mid)*(fc+4*f2+fr)/6, delta = left+right-whole;
      if (Math.abs(delta) <= 15*tol) return left+right+delta/15;
      if (depth === 0) return NaN; // Do not claim convergence for a singularity.
      return step(l,mid,fl,fc,f1,left,tol/2,depth-1)+step(mid,r,fc,fr,f2,right,tol/2,depth-1);
    }
    // Several starting panels avoid the simplest oscillatory aliasing.
    let total = 0;
    for (let i=0;i<8;i++) {
      const l=a+(b-a)*i/8, r=a+(b-a)*(i+1)/8, c=(l+r)/2;
      const fl=value(l), fr=value(r), fc=value(c);
      total += step(l,r,fl,fr,fc,(r-l)*(fl+4*fc+fr)/6,tolerance/8,maxDepth);
      if (!Number.isFinite(total)) return NaN;
    }
    return total;
  }
  function numericDerivative(fn,x) {
    const h = 1e-4 * Math.max(1,Math.abs(x));
    const f0=fn(x), fp=fn(x+h), fm=fn(x-h), fpp=fn(x+2*h), fmm=fn(x-2*h);
    if (![f0,fp,fm,fpp,fmm].every(Number.isFinite)) return NaN;
    const right=(fp-f0)/h, left=(f0-fm)/h;
    if (Math.abs(right-left) > 0.01 * (1+Math.abs(right)+Math.abs(left))) return NaN;
    return (-fpp+8*fp-8*fm+fmm)/(12*h);
  }
  const zero = () => 0;
  function compile(node,scope,variable='x') {
    function make(n) {
      if (n.type === 'number') return {v:()=>n.value,d:zero};
      if (n.type === 'id') {
        if(scope.locals?.has(n.name))return {v:()=>scope.vars[n.name],d:zero};
        if (n.name === variable) return {v:x=>x,d:()=>1};
        if (n.name === 'y') return {v:(x,y)=>y,d:zero};
        if (Object.hasOwn(constants,n.name)) return {v:()=>constants[n.name],d:zero};
        if (!Object.hasOwn(scope.vars,n.name)) throw Error(`未定义变量 ${n.name}；先输入 ${n.name}=1`);
        if (!Number.isFinite(scope.vars[n.name])&&!S.isDistribution(scope.vars[n.name])) throw Error(`变量 ${n.name} 的定义无效`);
        return {v:()=>scope.vars[n.name],d:zero,distribution:S.isDistribution(scope.vars[n.name])?()=>scope.vars[n.name]:undefined};
      }
      if (n.type === 'point') throw Error('坐标只用于点，例如 (1,2)');
      if (n.type === 'unary') { const a=make(n.arg); return n.op==='+' ? a : {v:(x,y)=>-a.v(x,y),d:(x,y)=>-a.d(x,y),discrete:a.discrete}; }
      if (n.type === 'compare') {
        const args=n.args.map(make);
        return {v:(x,y)=>n.ops.every((op,i)=>{
          const a=args[i].v(x,y), b=args[i+1].v(x,y);
          if (!Number.isFinite(a)||!Number.isFinite(b)) return false;
          return {'=':()=>a===b,'==':()=>a===b,'!=':()=>a!==b,'<':()=>a<b,'>':()=>a>b,'<=':()=>a<=b,'>=':()=>a>=b}[op]();
        })?1:0,d:()=>NaN};
      }
      if (n.type === 'binary') {
        const a=make(n.left), b=make(n.right), av=a.v,bv=b.v,ad=a.d,bd=b.d,meta={discrete:!!(a.discrete||b.discrete)};
        switch(n.op) {
          case '+': return {...meta,v:(x,y)=>av(x,y)+bv(x,y),d:(x,y)=>ad(x,y)+bd(x,y)};
          case '-': return {...meta,v:(x,y)=>av(x,y)-bv(x,y),d:(x,y)=>ad(x,y)-bd(x,y)};
          case '*': return {...meta,v:(x,y)=>av(x,y)*bv(x,y),d:(x,y)=>ad(x,y)*bv(x,y)+av(x,y)*bd(x,y)};
          case '/': return {...meta,v:(x,y)=>av(x,y)/bv(x,y),d:(x,y)=>(ad(x,y)*bv(x,y)-av(x,y)*bd(x,y))/(bv(x,y)**2)};
          case '^': return {...meta,v:(x,y)=>av(x,y)**bv(x,y),d:(x,y)=>{
            const A=av(x,y), B=bv(x,y), D=bd(x,y);
            if (D===0) return B===0?0:B*A**(B-1)*ad(x,y);
            return A**B*(D*Math.log(A)+B*ad(x,y)/A);
          }};
          case '&&': return {...meta,v:(x,y)=>av(x,y)&&bv(x,y)?1:0,d:()=>NaN};
          case '||': return {...meta,v:(x,y)=>av(x,y)||bv(x,y)?1:0,d:()=>NaN};
        }
      }
      if (n.type === 'call') {
        if(n.name==='sum'){
          if(n.order||n.args.length!==4||n.args[1].type!=='id')throw Error('求和写作 sum(表达式,n,k,p)');
          const name=n.args[1].name;if(Object.hasOwn(constants,name)||['i','y'].includes(name))throw Error('求和下标建议用 n、k 或 j');
          const local={...scope,vars:Object.create(scope.vars),locals:new Set([...(scope.locals||[]),name])};local.vars[name]=0;
          const body=compile(n.args[0],local,variable),lower=make(n.args[2]),upper=make(n.args[3]);
          const value=(x,y,derivative=false)=>{const a=lower.v(x,y),b=upper.v(x,y);if(!Number.isInteger(a)||!Number.isInteger(b))return NaN;if(derivative&&(lower.d(x,y)!==0||upper.d(x,y)!==0))return NaN;return S.sum(k=>{local.vars[name]=k;return (derivative?body.d:body.v)(x,y);},a,b);};
          return {v:(x,y)=>value(x,y),d:(x,y)=>value(x,y,true)};
        }
        if(['P','p'].includes(n.name)&&n.args[0]?.type==='compare'){
          const event=n.args[0];if(n.order||n.args.length!==1||event?.type!=='compare'||event.args.length!==2||!['=','=='].includes(event.ops[0])||event.args[0].type!=='id')throw Error('概率写作 P(X=n)');
          const name=event.args[0].name,d=scope.randomVariables?.[name];if(!S.isDistribution(d))throw Error(`先定义 ${name}~distribution`);
          let self=false;walk(event.args[1],p=>{if(p.type==='id'&&p.name===name)self=true;});if(self)throw Error('概率右侧不能引用同一随机变量');
          const at=make(event.args[1]);return {v:(x,y)=>{const k=at.v(x,y);return Number.isFinite(k)?d.discrete?d.pmf(k):0:NaN;},d:()=>NaN};
        }
        if(S.canonical(n.name)){
          if(n.order)throw Error('分布构造不能带导数');const args=n.args.map(make);let values=[],cached;
          const v=(x,y)=>{const next=args.map(a=>a.v(x,y));if(!cached||next.some((a,i)=>a!==values[i])){cached=S.create(n.name,next);values=next;}return cached;};
          let varying=false;for(const arg of n.args)walk(arg,p=>{if(p.type==='id'&&[variable,'y'].includes(p.name))varying=true;});
          return {v,d:()=>NaN,distribution:varying?undefined:()=>v(0,0)};
        }
        if(['pdf','pmf','cdf'].includes(n.name)){
          if(n.order||n.args.length!==2)throw Error('概率函数需要分布和横坐标');const dist=make(n.args[0]),at=make(n.args[1]);
          const get=(x,y)=>{const d=dist.v(x,y);if(!S.isDistribution(d))throw Error('第一个参数必须为概率分布');return d;};
          const initial=get(0,0);if(n.name==='pmf'&&!initial.discrete)throw Error('连续分布使用 pdf');
          let coordinates=false;walk(n.args[1],p=>{if(p.type==='id'&&[variable,'y'].includes(p.name))coordinates=true;});
          const direct=n.args[1].type==='id'&&n.args[1].name===variable;
          if(initial.discrete&&coordinates&&!direct)throw Error('离散分布横坐标需直接使用函数参数');
          const v=(x,y)=>get(x,y)[n.name](at.v(x,y));
          return {v,d:(x,y)=>initial.discrete?(n.name==='cdf'&&!Number.isInteger(at.v(x,y))?0:NaN):numericDerivative(t=>v(t,y),x),discrete:initial.discrete&&direct&&n.name!=='cdf',step:initial.discrete&&direct&&n.name==='cdf',distribution:dist.distribution?()=>get(0,0):undefined,probability:true};
        }
        if(n.name==='discrete'){
          if(n.order||n.args.length!==1)throw Error('discrete 需要一个表达式');const f=make(n.args[0]);return {v:(x,y)=>Number.isInteger(x)?f.v(x,y):NaN,d:()=>NaN,discrete:true};
        }
        if (n.name === 'int' || n.name === 'integral') {
          if (n.order || ![1,3].includes(n.args.length)) throw Error('积分写作 int(f(x)) 或 int(f(x),a,b)');
          let integrand=n.args[0];
          if (integrand.type==='id' && scope.functions[integrand.name]) integrand={type:'call',name:integrand.name,order:0,args:[{type:'id',name:variable}]};
          const f=make(integrand), a=make(n.args[1]||num(0)), b=make(n.args[2]||{type:'id',name:variable});
          let nesting=0; walk(integrand,p=>{if(p.type==='call'&&['int','integral'].includes(p.name))nesting++;});
          walk(integrand,p=>{if(p.type==='call'&&scope.functions[p.name]?.hasIntegral)nesting++;});
          if (nesting) throw Error('暂不支持嵌套积分');
          if(f.discrete)throw Error('离散函数使用概率求和');
          return {integral:{fn:x=>f.v(x,0),a:x=>a.v(x,0),b:x=>b.v(x,0),step:f.step,explicit:n.args.length===3},v:(x,y)=>(f.step?S.integrateStep:integrate)(t=>f.v(t,y),a.v(x,y),b.v(x,y)),d:(x,y)=>f.v(b.v(x,y),y)*b.d(x,y)-f.v(a.v(x,y),y)*a.d(x,y)};
        }
        if (n.name === 'diff') {
          if (n.order || ![1,2].includes(n.args.length)) throw Error('导数写作 diff(f(x)) 或 diff(f(x),2)');
          const a=make(n.args[0]), at=n.args[1]?make(n.args[1]):null;
          const value=(x,y)=>{const t=at?at.v(x,y):x;return Number.isFinite(a.v(t,y))?a.d(t,y):NaN;};
          return {v:value,d:(x,y)=>numericDerivative(t=>value(t,y),x)};
        }
        if (Object.hasOwn(arities,n.name)) {
          if (n.order || n.args.length!==arities[n.name]) throw Error(`${n.name} 需要 ${arities[n.name]} 个参数`);
          const args=n.args.map(make), a=args[0], b=args[1], scale=scope.angle==='deg'?Math.PI/180:1;
          const fn = n.name==='ln'?Math.log:n.name==='log'?Math.log10:Math[n.name];
          const trig=['sin','cos','tan'].includes(n.name), inv=['asin','acos','atan'].includes(n.name);
          const v=(x,y)=>{const A=a.v(x,y);if(n.name==='root'){const B=b.v(x,y);return B===0?NaN:A<0&&Number.isInteger(B)&&Math.abs(B%2)===1?-((-A)**(1/B)):A**(1/B);}return trig?fn(A*scale):inv?fn(A)/scale:b?fn(A,b.v(x,y)):fn(A);};
          const d=(x,y)=>{
            const A=a.v(x,y), D=a.d(x,y), B=b?b.v(x,y):0, E=b?b.d(x,y):0;
            switch(n.name) {
              case 'sin':return Math.cos(A*scale)*scale*D;
              case 'cos':return -Math.sin(A*scale)*scale*D;
              case 'tan':return scale*D/Math.cos(A*scale)**2;
              case 'asin':return D/(Math.sqrt(1-A*A)*scale);
              case 'acos':return -D/(Math.sqrt(1-A*A)*scale);
              case 'atan':return D/((1+A*A)*scale);
              case 'sinh':return Math.cosh(A)*D;
              case 'cosh':return Math.sinh(A)*D;
              case 'tanh':return D/Math.cosh(A)**2;
              case 'sqrt':return D/(2*Math.sqrt(A));
              case 'cbrt':return D/(3*Math.cbrt(A)**2);
              case 'abs':return A===0?NaN:Math.sign(A)*D;
              case 'exp':return Math.exp(A)*D;
              case 'ln':return D/A;
              case 'log':case 'log10':return D/(A*Math.LN10);
              case 'log2':return D/(A*Math.LN2);
              case 'floor':case 'ceil':return Number.isInteger(A)?NaN:0;
              case 'round':return Number.isInteger(A+0.5)?NaN:0;
              case 'sign':return A===0?NaN:0;
              case 'min':return A===B?NaN:A<B?D:E;
              case 'max':return A===B?NaN:A>B?D:E;
              case 'atan2':return (B*D-A*E)/(A*A+B*B);
              case 'pow':return E===0?(B===0?0:B*A**(B-1)*D):A**B*(E*Math.log(A)+B*D/A);
              case 'root':return B===0?NaN:E===0?(A<0&&Number.isInteger(B)&&Math.abs(B%2)===1?Math.abs(A)**(1/B-1)*D/B:A**(1/B-1)*D/B):A**(1/B)*(D/(A*B)-E*Math.log(A)/(B*B));
              default:return NaN;
            }
          };
          return {v,d};
        }
        if (!Object.hasOwn(scope.functions,n.name)) {
          if(!n.order&&n.args.length===1&&(n.name===variable||Object.hasOwn(scope.vars,n.name)||Object.hasOwn(constants,n.name)))return make({type:'binary',op:'*',left:{type:'id',name:n.name},right:n.args[0]});
          throw Error(`未定义函数 ${n.name}`);
        }
        if (!scope.functions[n.name] || typeof scope.functions[n.name].v!=='function')throw Error(`函数 ${n.name} 的定义无效`);
        if (n.args.length!==1) throw Error('自定义函数需要一个参数');
        const a=make(n.args[0]);
        const get=()=>scope.functions[n.name];
        const derivative=(f,t)=>n.order===0?f.d(t,0):numericDerivative(s=>f.d(s,0),t);
        const v=(x,y)=>{const f=get(), t=a.v(x,y);return n.order===0?f.v(t,0):n.order===1?f.d(t,0):numericDerivative(s=>f.d(s,0),t);};
        const d=(x,y)=>n.order===2?numericDerivative(t=>v(t,y),x):derivative(get(),a.v(x,y))*a.d(x,y);
        return {v,d,discrete:get().discrete,step:get().step,distribution:get().distribution,probability:get().probability};
      }
      throw Error('不支持的表达式');
    }
    const result=make(node);
    walk(node,n=>{if(n.type==='call'&&['pmf','pdf','discrete'].includes(n.name)){const child=make(n);if(child.discrete)result.discrete=true;}});
    return {...result,v:result.v,d:(x,y)=>Number.isFinite(result.v(x,y))?result.d(x,y):NaN};
  }
  function classify(source) {
    let text=normalize(source), restriction=null;
    const match=text.match(/\{([^{}]+)\}\s*$/);
    if (match) {restriction=parse(match[1]);text=text.slice(0,match.index).trim();}
    const distribution=text.match(/^([A-Za-z][A-Za-z0-9_]*)\s*~\s*(.+)$/);
    if(distribution)return {kind:'distribution',randomVariable:distribution[1],ast:parse(distribution[2]),restriction,text};
    const def=text.match(/^([A-Za-z][A-Za-z0-9_]*)(?:\s*\(\s*([A-Za-z][A-Za-z0-9_]*)\s*\))?\s*=(?!=)(.*)$/);
    if (def && !['x','y'].includes(def[1])) {
      if (reserved.has(def[1])||S.canonical(def[1])&&(def[1]!=='n'||def[2])) throw Error(`${def[1]} 是保留名称`);
      if (restriction && !def[2]) throw Error('常量不能带定义域限制');
      if (def[2] && (Object.hasOwn(constants,def[2]) || reserved.has(def[2]) && def[2]!=='x')) throw Error('函数参数建议用 x 或 t');
      const ast=parse(def[3]);
      if(!def[2]&&ast.type==='call'&&ast.name==='segment'&&ast.args.length===4)return {kind:'segment',name:def[1],ast,restriction,text};
      return {kind:def[2]?'function':'variable',name:def[1],parameter:def[2],ast,restriction,text};
    }
    const explicit=text.match(/^([xy])\s*=(?!=)(.*)$/);
    if (explicit) {
      const rhs=parse(explicit[2]);let self=false;walk(rhs,n=>{if(n.type==='id'&&n.name===explicit[1])self=true;});
      let other=false;walk(rhs,n=>{if(n.type==='id'&&n.name==='y')other=true;});
      if(!self&&!(explicit[1]==='x'&&other))return {kind:explicit[1]==='y'?'curve':'vertical',ast:rhs,restriction,text};
    }
    const ast=parse(text);
    if(ast.type==='call'&&ast.name==='segment'&&ast.args.length===4)return {kind:'segment',ast,restriction,text};
    if (ast.type==='point') return {kind:'point',ast,restriction,text};
    if (ast.type==='compare') {
      if (ast.args.length!==2) throw Error('图形关系使用一个比较符号；连续比较用于 {区间}');
      return {kind:['=','=='].includes(ast.ops[0])?'implicit':'inequality',ast,restriction,text};
    }
    let coordinates=false;const excluded=probabilityNames(ast);walk(ast,n=>{if(n.type==='call'&&n.name==='sum'&&n.args[1]?.name==='x'){excluded.add(n.args[1]);walk(n.args[0],c=>{if(c.type==='id'&&c.name==='x')excluded.add(c);});}});walk(ast,n=>{if(n.type==='id'&&n.name==='x'&&!excluded.has(n))coordinates=true;if(n.type==='call'&&['int','integral','diff'].includes(n.name))coordinates=true;});
    return {kind:coordinates?'curve':'value',ast,restriction,text};
  }
  function build(rows,angle='rad') {
    const scope={vars:Object.create(null),functions:Object.create(null),randomVariables:Object.create(null),angle}, entries=rows.map(row=>{
      try {return {...row,...(row.text.trim()?classify(row.text):{kind:'empty'}),text:row.text};} catch(e){return {...row,kind:'error',error:e.message};}
    }), definitions=new Map();
    for (const entry of entries) if (['function','variable'].includes(entry.kind)||entry.kind==='distribution'&&entry.randomVariable) {
      if(entry.randomVariable)entry.name=entry.randomVariable;
      if (definitions.has(entry.name)) {entry.error=`${entry.name} 已经定义`;continue;}
      definitions.set(entry.name,entry);if(entry.kind!=='distribution')scope[entry.kind==='variable'?'vars':'functions'][entry.name]=NaN;
    }
    const state=new Map();
    function resolve(entry,depth=0) {
      if (depth>32) throw Error('定义依赖最多 32 层');
      if (state.get(entry)===2) {if(entry.error)throw Error(entry.error);return;}
      if (state.get(entry)===1) throw Error('定义不能循环引用');
      state.set(entry,1);
      const nodes=[entry.ast,...(entry.restriction?[entry.restriction]:[])];
      for(const ast of nodes)walk(ast,n=>{
        const name=n.type==='id'||n.type==='call'?n.name:null;
        if (name && name!==entry.parameter && definitions.has(name)) resolve(definitions.get(name),depth+1);
        if (n.type==='call' && ['int','integral'].includes(n.name)) {
          // Indirect nested integration would multiply work per sample.
          walk(n.args[0],c=>{const ref=definitions.get(c.name);if(ref && ref.hasIntegral)throw Error('暂不支持嵌套积分');});
        }
      });
      entry.hasIntegral=false;walk(entry.ast,n=>{if(n.type==='call'&&['int','integral'].includes(n.name))entry.hasIntegral=true;const ref=definitions.get(n.name);if(ref && ref!==entry && ref.hasIntegral)entry.hasIntegral=true;});
      if(entry.kind==='function'){let hasY=false;walk(entry.ast,n=>{if(n.type==='id'&&n.name==='y')hasY=true;});if(hasY)throw Error('一元函数不能含 y；关系写作 x^2+y^2=9');}
      entry.compiled=compile(entry.ast,scope,entry.parameter||'x');
      if(entry.restriction){const r=compile(entry.restriction,scope,entry.parameter||'x'),f=entry.compiled;entry.compiled={...f,v:(x,y)=>r.v(x,y)?f.v(x,y):NaN,d:(x,y)=>{const h=1e-7*Math.max(1,Math.abs(x));return r.v(x,y)&&r.v(x-h,y)&&r.v(x+h,y)?f.d(x,y):NaN;}};}
      entry.compiled.hasIntegral=entry.hasIntegral;
      if(entry.kind==='distribution'){
        let varies=false;walk(entry.ast,n=>{if(n.type==='id'&&['x','y'].includes(n.name))varies=true;});if(varies)throw Error('分布参数不能依赖坐标');
        const d=entry.compiled.v(0,0);if(!S.isDistribution(d))throw Error('~ 的右侧必须为概率分布');scope.randomVariables[entry.randomVariable]=d;
      }else if (entry.kind==='variable') {
        let dependsOnCoordinates=false;const excluded=probabilityNames(entry.ast);walk(entry.ast,n=>{if(n.type==='id'&&['x','y'].includes(n.name)&&!excluded.has(n))dependsOnCoordinates=true;});
        if(dependsOnCoordinates)throw Error('变量应为常数；函数写作 f(x)=…');
        const value=entry.compiled.v(0,0);
        if(!Number.isFinite(value)&&!S.isDistribution(value))throw Error('变量的值必须为有限实数');
        scope.vars[entry.name]=value;
        let depends=false;walk(entry.ast,n=>{if((n.type==='id'||n.type==='call')&&definitions.has(n.name))depends=true;});
        entry.distributionDefinition=S.isDistribution(value);entry.slider=!entry.distributionDefinition&&!depends;
      } else scope.functions[entry.name]=entry.compiled;
      state.set(entry,2);
    }
    for(const entry of definitions.values()) try{resolve(entry);}catch(e){entry.error=e.message;state.set(entry,2);}
    for(const entry of entries) {
      if(entry.error||['empty','variable'].includes(entry.kind))continue;
      try {
        if(entry.kind==='distribution'){
          let varies=false;walk(entry.ast,n=>{if(n.type==='id'&&['x','y'].includes(n.name))varies=true;});if(varies)throw Error('分布参数不能依赖坐标');
          entry.compiled=compile(entry.ast,scope);const d=entry.compiled.v(0,0);if(!S.isDistribution(d))throw Error('~ 的右侧必须为概率分布');entry.distribution=d;entry.discrete=d.discrete;entry.probability=true;entry.fn=x=>d.pdf(x);entry.df=x=>d.discrete?NaN:numericDerivative(d.pdf,x);
        }
        else if(entry.kind==='function') {if(!entry.compiled)throw Error('函数定义无效');entry.fn=x=>entry.compiled.v(x,0);entry.df=x=>entry.compiled.d(x,0);}
        else if(entry.kind==='segment'){const values=entry.ast.args.map(n=>compile(n,scope).v(0,0));if(!values.every(Number.isFinite))throw Error('线段端点必须为有限实数');entry.segment=[values.slice(0,2),values.slice(2,4)];}
        else if(entry.kind==='point')entry.point=entry.ast.args.map(n=>compile(n,scope).v(0,0));
        else if(['implicit','inequality'].includes(entry.kind)) {
          const a=compile(entry.ast.args[0],scope),b=compile(entry.ast.args[1],scope);
          entry.fn=(x,y)=>a.v(x,y)-b.v(x,y);entry.op=entry.ast.ops[0];
        } else {
          entry.compiled=compile(entry.ast,scope);entry.fn=x=>entry.compiled.v(x,0);entry.df=x=>entry.compiled.d(x,0);
          if(entry.kind==='value')entry.value=entry.fn(0);
        }
        if(entry.compiled){entry.integral=entry.compiled.integral;entry.discrete=entry.discrete||!!entry.compiled.discrete;entry.step=!!entry.compiled.step;entry.probability=entry.probability||!!entry.compiled.probability;if(entry.compiled.distribution&&!entry.distribution)entry.distribution=entry.compiled.distribution();}
        if(entry.kind==='value'&&S.isDistribution(entry.value)){entry.kind='distribution';entry.distribution=entry.value;entry.discrete=entry.value.discrete;entry.probability=true;entry.fn=x=>entry.value.pdf(x);entry.df=x=>entry.value.discrete?NaN:numericDerivative(entry.value.pdf,x);}
        // Constant definite integrals remain scalar results, not horizontal graphs.
        if(entry.kind==='curve'&&entry.ast.type==='call'&&['int','integral','diff'].includes(entry.ast.name)&&entry.ast.args.length>1) {
          let varying=false;for(const n of entry.ast.args.slice(1))walk(n,p=>{if(p.type==='id'&&p.name==='x')varying=true;});
          if(!varying){entry.kind='value';entry.value=entry.fn(0);}
        }
        if(entry.restriction){const r=compile(entry.restriction,scope,entry.parameter||'x');entry.allowed=(x,y)=>!!r.v(x,y);}
        entry.hasIntegral=entry.hasIntegral||false;walk(entry.ast,n=>{if(n.type==='call'&&['int','integral'].includes(n.name))entry.hasIntegral=true;if(definitions.get(n.name)?.hasIntegral)entry.hasIntegral=true;});
      }catch(e){entry.error=e.message;}
    }
    const parameterHints=Object.create(null);for(const e of entries)if(e.ast)walk(e.ast,n=>{if(n.type==='call'&&S.canonical(n.name)){const hints=S.hints[S.canonical(n.name)];n.args.forEach((a,i)=>{if(a.type==='id'&&hints[i])parameterHints[a.name]={...parameterHints[a.name],...hints[i]};});}});
    C.enrich(entries,scope,{walk,constants});
    return {scope,entries,parameterHints};
  }
  const api={normalize,parse,classify,compile,build,integrate,numericDerivative,walk,constants};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.GraphMath=api;
})(typeof globalThis==='object'?globalThis:this);
