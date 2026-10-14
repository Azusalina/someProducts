const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../math.js'),L=require('../latex.js');
function evaluate(text,x=1,defs=[]){const e=M.build([...defs,text].map(text=>({text}))).entries.at(-1);assert.equal(e.error,undefined);return e.fn?e.fn(x):e.value;}
function close(a,b){assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);}
test('parenthesis-free unary functions and powered trig functions',()=>{
 for(const s of ['sinx','sin x','sin(x)','\\sin x'])close(evaluate(s),Math.sin(1));for(const s of ['sin^2(x)','sin^2 x','\\sin^{2}(x)','\\sin^2\\left(x\\right)'])close(evaluate(s),Math.sin(1)**2);close(evaluate('sin^n(x)',1,['n=3']),Math.sin(1)**3);close(evaluate('cosx^2',2),Math.cos(4));close(evaluate('sinhx'),Math.sinh(1));
});
test('LaTeX fractions, roots, subscripts and Greek parameters',()=>{
 close(evaluate('\\frac{x^{2}+1}{2}',2),2.5);close(evaluate('\\sqrt{x^2+1}',2),Math.sqrt(5));close(evaluate('\\sqrt[3]{x}',8),2);close(evaluate('\\sqrt[3]{x}',-8),-2);close(evaluate('diff(\\sqrt[3]{x})',-8),1/12);close(evaluate('a_{1}x',2,['a_1=3']),6);close(evaluate('\\alpha\\sin x',1,['alpha=2']),2*Math.sin(1));close(evaluate('\\left|x\\right|',-2),2);
 close(evaluate('\\alpha_{1}x',2,['alpha_1=3']),6);close(evaluate('g(2)',1,['g ( t ) = t^2']),4);close(evaluate('g(2)',1,['g(\\theta)=\\theta^2']),4);
});
test('LaTeX integrals, local differential and derivative operator',()=>{
 close(evaluate('\\int_{0}^{2} x^2 \\,\\mathrm{d}x'),8/3);close(evaluate('\\int_0^x t^2\\,dt',3),9);close(evaluate('\\frac{d}{dx}\\sin x'),Math.cos(1));close(evaluate("f^{\\prime}(x)",2,['f(x)=x^2']),4);
});
test('display round-trips preserve powers, fractions and restrictions',()=>{
 for(const s of ['f(x)=sin^2(x)','sinx','(x+1)/(x-1)','sqrt(x)','int(x^2,0,x)','x^2{-2<x<2}',"f'(x)",'a_1=2','diff(x^2){x>0}','diff(x)+1']){const a=M.classify(s),b=M.classify(L.toLatex(s));assert.equal(b.kind,a.kind,s);assert.deepEqual(b.ast,a.ast,s);if(a.restriction)assert.deepEqual(a.restriction,b.restriction);}
});
test('unsupported or incomplete LaTeX is rejected without running commands',()=>{
 for(const s of ['\\frac{x}','\\input{secret}','\\href{javascript:alert(1)}{x}','\\sqrt{','\\begin{matrix}1&2\\end{matrix}'])assert.throws(()=>M.parse(s));
});
