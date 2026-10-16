/* Bounded mathematical LaTeX conversion, independent of the display library. */
(function(root){
  'use strict';
  function toPlain(source,inner=false){
    if(source.length>600)throw Error('表达式最多 600 字符');
    if(!source.includes('\\')&&!inner&&!/[\^_]\s*\{/.test(source))return source;
    const s=source.replace(/\\ell\s*_\s*(?:\{(\d+)\}|(\d+))/g,(_,a,b)=>'l'+(a||b)).trim().replace(/^\$\$?|\$\$?$/g,'').replace(/^\\\(|\\\)$/g,'').replace(/\^\{((?:\\prime\s*){1,2})\}/g,(_,p)=>"'".repeat((p.match(/\\prime/g)||[]).length)).replace(/\\(?:left|right|bigl|bigr|displaystyle|textstyle)\b/g,'').replace(/\\(?:,|;|!|:|quad\b|qquad\b|enspace\b)/g,' ').replace(/\\(?:mathrm|operatorname|mathit)\s*\{d\s*([A-Za-z])\}/g,'d $1').replace(/\\(?:mathrm|operatorname)\s*\{d\}/g,'d');
    let i=0;
    const skip=()=>{while(/\s/.test(s[i]||'')&&i<s.length)i++;};
    function group(open='{',close='}'){
      skip();if(s[i]!==open)throw Error(`需要 ${open}`);let depth=1,start=++i;
      while(i<s.length&&depth){if(s[i]===open)depth++;if(s[i]===close)depth--;if(depth)i++;}
      if(depth)throw Error(`需要 ${close}`);const text=s.slice(start,i++);return text;
    }
    function atom(){skip();if(s[i]==='{')return toPlain(group(),true);if(s[i]==='(')return toPlain(group('(',')'),true);if(s[i]==='\\'){const start=i;const cmd=s.slice(i).match(/^\\[A-Za-z]+/);if(!cmd)throw Error('无效 LaTeX');i+=cmd[0].length;return toPlain(s.slice(start,i));}const m=s.slice(i).match(/^(?:\d+(?:\.\d+)?|[A-Za-z])/);if(!m)throw Error('缺少上下限或指数');i+=m[0].length;return m[0];}
    let out='';
    while(i<s.length){
      if(s[i]==='{'){out+='('+toPlain(group(),true)+')';continue;}
      if(s[i]==='}'){throw Error('多余的 }');}
      if(s[i]==='_'){
        i++;const sub=atom();if(!/^[A-Za-z0-9]+$/.test(sub))throw Error('下标使用字母或数字');out=out.trimEnd()+'_'+sub+' ';continue;
      }
      if(s[i]!=='\\'){out+=s[i++];continue;}
      i++;const m=s.slice(i).match(/^[A-Za-z]+/);const cmd=m?m[0]:s[i++];if(m)i+=cmd.length;
      if(['frac','dfrac','tfrac'].includes(cmd)){
        const numerator=toPlain(group(),true),denominator=toPlain(group(),true);
        if(numerator.trim()==='d'&&/^d\s*x$/.test(denominator.trim())){skip();if(s[i]==='(')out+=`diff(${toPlain(group('(',')'),true)})`;else{const rest=toPlain(s.slice(i)).trim();if(!rest)throw Error('缺少被微分表达式');out+=`diff(${rest})`;i=s.length;}}
        else out+=`((${numerator})/(${denominator}))`;
      }else if(cmd==='sqrt'){
        skip();let order=null;if(s[i]==='[')order=toPlain(group('[',']'),true);const value=toPlain(group(),true);out+=order?`root(${value},${order})`:`sqrt(${value})`;
      }else if(['operatorname','mathrm','mathit','mathnormal'].includes(cmd))out+=toPlain(group(),true);
      else if(cmd==='sum'){
        let lower=null,upper=null;skip();for(let n=0;n<2&&['_','^'].includes(s[i]);n++){const type=s[i++],value=atom();if(type==='_')lower=value;else upper=value;skip();}
        const match=lower?.match(/^([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.+)$/);if(!match||upper===null)throw Error('求和需要下标 n=k 和上限 p');
        let body;if(s[i]==='{')body=toPlain(group(),true);else if(s[i]==='(')body=toPlain(group('(',')'),true);else{body=toPlain(s.slice(i),true);i=s.length;}if(!body.trim())throw Error('求和缺少表达式');out+=`sum(${body},${match[1]},${match[2]},${upper})`;
      }
      else if(cmd==='int'){
        let lower='0',upper='x';skip();
        for(let n=0;n<2&&['_','^'].includes(s[i]);n++){const type=s[i++],value=atom();if(type==='_')lower=value;else upper=value;skip();}
        const rest=s.slice(i);let differential=null,depth=0;
        for(let j=0;j<rest.length;j++){
          if('({['.includes(rest[j]))depth++;else if(')}]'.includes(rest[j]))depth--;
          if(depth===0&&rest[j]==='d'){const m=rest.slice(j).match(/^d\s*([A-Za-z])(?=$|[^A-Za-z_])/);if(m){differential={index:j,0:m[0],1:m[1]};break;}}
        }
        if(!differential)throw Error('积分缺少 dx');
        const variable=differential[1]||differential[2];let body=toPlain(rest.slice(0,differential.index),true);
        if(variable!=='x')body=body.replace(new RegExp(`\\b${variable}\\b`,'g'),'x');
        out+=`int(${body},${lower},${upper})`;i+=differential.index+differential[0].length;
      }else if(['sin','cos','tan','sinh','cosh','tanh','asin','acos','atan','ln','log','exp','min','max'].includes(cmd))out+=cmd+' ';
      else if(['arcsin','arccos','arctan'].includes(cmd))out+=cmd.replace('arc','a')+' ';
      else if(['alpha','beta','gamma','delta','theta','lambda','mu','sigma','phi','omega','pi','tau'].includes(cmd))out+=cmd+' ';
      else if(cmd==='cdot'||cmd==='times')out+='*';else if(cmd==='div')out+='/';
      else if(['le','leq'].includes(cmd))out+='<=';else if(['ge','geq'].includes(cmd))out+='>=';else if(['ne','neq'].includes(cmd))out+='!=';else if(cmd==='sim')out+='~';
      else if(cmd==='{'||cmd==='lbrace')out+='{';else if(cmd==='}'||cmd==='rbrace')out+='}';else if(cmd==='lt')out+='<';else if(cmd==='gt')out+='>';else if(cmd==='vert'||cmd==='lvert'||cmd==='rvert'||cmd==='mid')out+='|';
      else if(cmd==='prime')out+="'";else if(cmd===' ')out+=' ';
      else throw Error(`不支持的数学命令 \\${cmd}`);
    }
    return out.replace(/\|([^|]+)\|/g,'abs($1)');
  }
  function identifier(name){
    if(/^l\d+$/.test(name))return '\\ell_{'+name.slice(1)+'}';
    const greek=['alpha','beta','gamma','delta','theta','lambda','mu','sigma','phi','omega','pi','tau'];
    const [base,sub]=name.split('_');return (greek.includes(base)?'\\'+base:base.length===1?base:'\\mathrm{'+base+'}')+(sub?'_{'+sub+'}':'');
  }
  function astTex(n){
    if(n.type==='number')return String(n.value);
    if(n.type==='id')return identifier(n.name);
    if(n.type==='unary')return n.op+astTex(n.arg);
    if(n.type==='point')return '\\left('+n.args.map(astTex).join(',')+'\\right)';
    if(n.type==='compare')return n.args.map((a,i)=> (i?({'<=':'\\leq ','>=':'\\geq ','!=':'\\ne ','==':'='}[n.ops[i-1]]||n.ops[i-1]):'')+astTex(a)).join('');
    if(n.type==='binary'){
      const a=astTex(n.left),b=astTex(n.right),wrap=t=>'\\left('+t+'\\right)';
      if(n.op==='/')return '\\frac{'+a+'}{'+b+'}';
      if(n.op==='^'){
        if(n.left.type==='call'&&['sin','cos','tan','sinh','cosh','tanh'].includes(n.left.name))return '\\'+n.left.name+'^{'+b+'}\\left('+astTex(n.left.args[0])+'\\right)';
        return (['number','id','call'].includes(n.left.type)?a:wrap(a))+'^{'+b+'}';
      }
      if(n.op==='*')return (['binary','compare'].includes(n.left.type)&&['+','-'].includes(n.left.op)?wrap(a):a)+'\\cdot '+(['binary','compare'].includes(n.right.type)&&['+','-'].includes(n.right.op)?wrap(b):b);
      return a+({'&&':'\\land ','||':'\\lor '}[n.op]||n.op)+(n.op==='-'&&n.right.type==='binary'&&['+','-'].includes(n.right.op)?wrap(b):b);
    }
    if(n.type==='call'){
      if(n.name==='sqrt')return '\\sqrt{'+astTex(n.args[0])+'}';
      if(n.name==='root')return '\\sqrt['+astTex(n.args[1])+']{'+astTex(n.args[0])+'}';
      if(n.name==='abs')return '\\left|'+astTex(n.args[0])+'\\right|';
      if(n.name==='sum'&&n.args.length===4)return '\\sum_{'+astTex(n.args[1])+'='+astTex(n.args[2])+'}^{'+astTex(n.args[3])+'}'+'\\left('+astTex(n.args[0])+'\\right)';
      if(['int','integral'].includes(n.name))return '\\int_{'+astTex(n.args[1]||{type:'number',value:0})+'}^{'+astTex(n.args[2]||{type:'id',name:'x'})+'}'+astTex(n.args[0])+'\\,\\mathrm{d}x';
      if(n.name==='diff'&&n.args.length===1)return '\\frac{d}{dx}\\left('+astTex(n.args[0])+'\\right)';
      const fn=['sin','cos','tan','sinh','cosh','tanh','ln','log','exp','min','max'].includes(n.name)?'\\'+n.name:['asin','acos','atan'].includes(n.name)?'\\arc'+n.name.slice(1):n.name.length===1?identifier(n.name):'\\operatorname{'+n.name+'}';
      return fn+("'".repeat(n.order||0))+'\\left('+n.args.map(astTex).join(',')+'\\right)';
    }
    throw Error('无法显示表达式');
  }
  function toLatex(source){
    if(!source.trim())return '';
    try{
      const e=root.GraphMath.classify(source);let tex=astTex(e.ast);
      if(e.kind==='distribution'&&e.randomVariable)tex=identifier(e.randomVariable)+'\\sim '+tex;
      if(e.kind==='function')tex=identifier(e.name)+'\\left('+identifier(e.parameter)+'\\right)='+tex;
      if(['segment','point'].includes(e.kind)&&e.name)tex=identifier(e.name)+'='+tex;
      if(e.kind==='variable')tex=identifier(e.name)+'='+tex;
      if(e.kind==='vertical')tex='x='+tex;
      if(e.kind==='curve'&&(e.lineLabel||/^\s*y\s*=/.test(toPlain(source))))tex='y='+tex;
      if(e.lineLabel)tex=identifier(e.name)+':\\quad '+tex;
      if(e.restriction)tex+='\\left\\{'+astTex(e.restriction)+'\\right\\}';
      return tex;
    }catch{return source.includes('\\')?source:source.replace(/[{}]/g,m=>'\\'+m);}
  }
  const api={toPlain,toLatex,astTex,identifier};root.GraphLatex=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis==='object'?globalThis:this);
