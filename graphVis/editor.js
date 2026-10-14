(function(root){
  'use strict';
  const C=root.MathfieldElement;
  C.fontsDirectory=new URL('vendor/mathlive/fonts/',document.baseURI).href;C.soundsDirectory=null;C.computeEngine=null;
  function render(element,latex){
    if(element.dataset.latex===latex)return;
    element.dataset.latex=latex;
    element.innerHTML=latex?root.MathLive.convertLatexToMarkup(latex,{letterShapeStyle:'tex'}):'';
  }
  function configure(input,text){
    input.mathVirtualKeyboardPolicy='manual';input.popoverPolicy='off';input.menuItems=[];
    input.smartFence=true;input.inlineShortcuts={...input.inlineShortcuts,sin:'\\sin',cos:'\\cos',tan:'\\tan',sqrt:'\\sqrt{#?}',pi:'\\pi',int:'\\int_{#?}^{#?}'};
    input.setValue(root.GraphLatex.toLatex(text),{silenceNotifications:true});
  }
  root.GraphEditor={render,configure};
})(globalThis);
