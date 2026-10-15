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
    input.tabIndex=0;
    input.mathVirtualKeyboardPolicy='manual';input.popoverPolicy='off';input.menuItems=[];
    input.smartFence=true;input.inlineShortcuts={};
    input.setValue(root.GraphLatex.toLatex(text),{silenceNotifications:true});
  }
  function moveIntegralBoundary(input,direction){
    const at=input.position;
    for(let end=1;end<=input.lastOffset;end++){
      const info=input.getElementInfo(end);if(!/^\\int(?:\b|[_^])/.test(info?.latex||''))continue;
      let start=end;while(start>0&&(input.getElementInfo(start-1)?.depth||0)>info.depth)start--;
      const branches=[];for(let j=start;j<end;j++){const child=input.getElementInfo(j);if(child?.depth===info.depth+1&&child.latex==='')branches.push(j);}
      if(branches.length!==2||at<start-1||at>end)continue;
      input.position=direction==='up'?end-1:branches[1]-1;return true;
    }
    return false;
  }
  root.GraphEditor={render,configure,moveIntegralBoundary};
})(globalThis);
