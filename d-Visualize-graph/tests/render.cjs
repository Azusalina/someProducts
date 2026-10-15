/* Native Canvas verification; it does not render browser CSS or the mathfield UI. */
const {createCanvas,GlobalFonts}=require(process.env.GRAPHVIS_CANVAS||'@napi-rs/canvas');
const {boot}=require('./ui-helper.cjs');
const fs=require('node:fs'),path=require('node:path');
(async()=>{
  GlobalFonts.registerFromPath(path.join(__dirname,'../vendor/mathlive/fonts/KaTeX_Main-Regular.woff2'),'KaTeX_Main');
  const t=boot(null,{canvasFactory:createCanvas});t.click('tools-toggle');
  const mode=process.argv[3];const expressions=mode==='complex'?['2+3i','f(x)=x+i']:mode==='integral'?['\\int_0^2 x^2dx']:mode==='poisson'?['lambda=4','x~poisson(lambda)']:mode==='normal'?['x~normal(0,1)']:mode==='cdf'?['cdf(poisson(4),x)']:mode==='implicit'?['x^2+y^2=9','y<x^2-2']:['f(x)=\\sin x',"f'(x)"];
  for(let i=0;i<expressions.length;i++){if(i)t.click('add');t.input(t.texts()[i],expressions[i]);}
  if(['poisson','normal'].includes(mode)){t.check('integral-on',true);t.input(t.get('bound-a'),'1');t.input(t.get('bound-b'),'3');}else if(!['implicit','cdf','integral','complex'].includes(mode)){t.check('tangent-on',true);t.check('integral-on',true);}
  if(mode==='integral')t.input(t.get('area-color'),'#d654a6');if(process.argv[4]==='dark')t.click('theme-toggle');t.flush();fs.writeFileSync(process.argv[2]||'/tmp/graphvis-render.png',t.nativeCanvases.get(t.get('canvas')).toBuffer('image/png'));await t.dispose();
})().catch(error=>{console.error(error);process.exitCode=1;});
