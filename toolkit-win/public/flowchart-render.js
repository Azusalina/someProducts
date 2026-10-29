let library;
function mermaidLibrary(){
 if(window.mermaid)return Promise.resolve(window.mermaid);
 if(!library)library=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='/lib/mermaid.js';
  script.onload=()=>resolve(window.mermaid);script.onerror=()=>{library=null;script.remove();reject(new Error('Could not load the local SVG renderer. Refresh and try again.'));};
  document.head.append(script);
 });
 return library;
}
export async function renderFlowchart(diagram){
 const mermaid=await mermaidLibrary();
 mermaid.initialize({startOnLoad:false,securityLevel:'strict',suppressErrorRendering:true,theme:'neutral',look:'classic',htmlLabels:false,flowchart:{htmlLabels:false},maxTextSize:50000,maxEdges:500,fontFamily:'Segoe UI,Arial,sans-serif'});
 const container=document.createElement('div');container.style.cssText='position:fixed;left:-100000px;top:0;pointer-events:none';document.body.append(container);
 try{
  const {svg}=await mermaid.render('code-flowchart-render',diagram,container);
  const documentSvg=new DOMParser().parseFromString(svg,'image/svg+xml');
  if(documentSvg.querySelector('parsererror')||documentSvg.documentElement.localName!=='svg')throw new Error('Could not create SVG.');
  const root=documentSvg.documentElement;
  // Replace reserved label characters only in XML text, never as HTML markup.
  const walker=documentSvg.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  for(let text=walker.nextNode();text;text=walker.nextNode())text.data=text.data.replace(/[\uE000-\uE006]/g,c=>['&','"','#','<','>','\\','`'][c.charCodeAt(0)-0xe000]);
  const box=root.getAttribute('viewBox')?.split(/[ ,]+/).map(Number);
  if(box?.length===4&&box.every(Number.isFinite)&&box[2]>0&&box[3]>0){root.setAttribute('width',String(Math.ceil(box[2])));root.setAttribute('height',String(Math.ceil(box[3])));}
  return new XMLSerializer().serializeToString(root);
 }finally{container.remove();}
}
