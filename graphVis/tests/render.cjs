/* Native Canvas verification; it does not render browser CSS or the mathfield UI. */
const {createCanvas,GlobalFonts}=require(process.env.GRAPHVIS_CANVAS||'@napi-rs/canvas');
const {boot}=require('./ui-helper.cjs');
const fs=require('node:fs'),path=require('node:path');
(async()=>{
  GlobalFonts.registerFromPath(path.join(__dirname,'../vendor/mathlive/fonts/KaTeX_Main-Regular.woff2'),'KaTeX_Main');
  const t=boot(null,{canvasFactory:createCanvas});t.click('tools-toggle');
  const expressions=process.argv[3]==='implicit'?['x^2+y^2=9','y<x^2-2']:['f(x)=\\sin x',"f'(x)"];
  for(let i=0;i<expressions.length;i++){if(i)t.click('add');t.input(t.texts()[i],expressions[i]);}
  if(process.argv[3]!=='implicit'){t.check('tangent-on',true);t.check('integral-on',true);}
  t.flush();fs.writeFileSync(process.argv[2]||'/tmp/graphvis-render.png',t.nativeCanvases.get(t.get('canvas')).toBuffer('image/png'));await t.dispose();
})().catch(error=>{console.error(error);process.exitCode=1;});
