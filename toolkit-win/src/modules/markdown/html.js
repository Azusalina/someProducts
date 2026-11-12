import sanitizeHtml from 'sanitize-html';
import {localImage} from '../../core/files.js';

const color=/^(?:#[\da-f]{3,8}|[a-z]+|(?:rgb|hsl)a?\([\d\s.,%+\-/]+\))$/i;
const unit='(?:0|(?:\\d*\\.)?\\d+(?:px|pt|pc|cm|mm|in|em|rem|%|vw|vh))';
const length=new RegExp(`^(?:auto|${unit})$`,'i');
const spacing=new RegExp(`^${unit}(?:\\s+${unit}){0,3}$`,'i');
const border=/^(?:none|(?:\d*\.)?\d+(?:px|pt|em)\s+(?:solid|dashed|dotted|double)(?:\s+(?:#[\da-f]{3,8}|[a-z]+|rgba?\([\d\s.,%]+\)))?)$/i;
const styles={
  color:[color],'background-color':[color],
  'text-align':[/^(?:left|right|center|justify|start|end)$/],
  'vertical-align':[/^(?:top|bottom|middle|baseline|sub|super|text-top|text-bottom)$/,length],
  'font-size':[length,/^(?:xx-small|x-small|small|medium|large|x-large|xx-large|smaller|larger)$/],
  'font-weight':[/^(?:normal|bold|bolder|lighter|[1-9]00)$/],
  'font-style':[/^(?:normal|italic|oblique)$/],
  'font-family':[/^[\p{L}\p{N}\s,'"_-]+$/u],
  'line-height':[length,/^(?:normal|\d+(?:\.\d+)?)$/],
  'text-decoration':[/^(?:(?:none|underline|overline|line-through)\s*)+$/],
  'white-space':[/^(?:normal|pre|pre-wrap|pre-line|nowrap|break-spaces)$/],
  'word-break':[/^(?:normal|break-all|keep-all|break-word)$/],
  'overflow-wrap':[/^(?:normal|break-word|anywhere)$/],
  display:[/^(?:block|inline|inline-block|flex|grid|none|table|table-row|table-cell)$/],
  'border-collapse':[/^(?:collapse|separate)$/],
  'border-spacing':[spacing],'table-layout':[/^(?:auto|fixed)$/],
  'list-style-type':[/^(?:none|disc|circle|square|decimal|lower-alpha|upper-alpha|lower-roman|upper-roman)$/],
  'page-break-before':[/^(?:auto|always|avoid|left|right)$/],
  'page-break-after':[/^(?:auto|always|avoid|left|right)$/],
  'page-break-inside':[/^(?:auto|avoid)$/],
  'break-before':[/^(?:auto|page|avoid|left|right)$/],
  'break-after':[/^(?:auto|page|avoid|left|right)$/],
  'break-inside':[/^(?:auto|avoid|avoid-page)$/],
};
for(const name of ['width','height','min-width','max-width','min-height','max-height'])styles[name]=[length];
for(const name of ['margin','padding']){
  styles[name]=[spacing,/^auto$/];
  for(const side of ['top','right','bottom','left'])styles[`${name}-${side}`]=[length];
}
for(const name of ['border','border-top','border-right','border-bottom','border-left'])styles[name]=[border];
const options={
  allowedTags:[...sanitizeHtml.defaults.allowedTags,'img','input','details','summary','del','ins','font','center'],
  allowedAttributes:{
    '*':['class','id','title','lang','dir','style','role','aria-label','aria-hidden'],
    a:['href','name','target','rel'],img:['src','alt','width','height'],
    table:['align','border','cellpadding','cellspacing','width'],
    th:['align','valign','colspan','rowspan','scope','headers','width','height'],
    td:['align','valign','colspan','rowspan','headers','width','height'],
    col:['span','width'],colgroup:['span','width'],
    p:['align'],div:['align'],h1:['align'],h2:['align'],h3:['align'],h4:['align'],h5:['align'],h6:['align'],
    ol:['start','reversed','type'],li:['value'],details:['open'],
    font:['color','face','size'],input:['type','checked','disabled'],
  },
  allowedStyles:{'*':styles},
  allowedSchemes:['http','https','mailto'],allowedSchemesByTag:{img:['data']},allowProtocolRelative:false,
  nonTextTags:['script','style','textarea','option','xmp','noscript','iframe','object','embed','template','svg','math','head'],
  exclusiveFilter:frame=>frame.tag==='input'&&frame.attribs.type!=='checkbox',
};
function anchor(_tag,attrs){
  const href=(attrs.href||'').trim();
  if(href.startsWith('#')){attrs.href=href;delete attrs.target;}
  else if(/^(?:https?:|mailto:)/i.test(href)){attrs.href=href;attrs.target='_blank';attrs.rel='noopener noreferrer';}
  else{attrs.href='#';delete attrs.target;}
  return {tagName:'a',attribs:attrs};
}
const checkbox=(_tag,attrs)=>({tagName:'input',attribs:{...attrs,disabled:''}});
function presentation(tagName,attrs){
  const fallback=[];
  const add=(name,value)=>{if(!new RegExp(`(?:^|;)\\s*${name}\\s*:`,'i').test(attrs.style||''))fallback.push(`${name}:${value}`);};
  if(/^(left|right|center|justify)$/i.test(attrs.align||''))add('text-align',attrs.align.toLowerCase());
  if(/^(top|middle|bottom|baseline)$/i.test(attrs.valign||''))add('vertical-align',attrs.valign.toLowerCase());
  for(const name of ['width','height'])if(/^\d+(?:\.\d+)?%?$/.test(attrs[name]||''))add(name,attrs[name]+(attrs[name].endsWith('%')?'':'px'));
  if(fallback.length)attrs.style=fallback.join(';')+';'+(attrs.style||'');
  return {tagName,attribs:attrs};
}


export async function renderHtml(html,{filename,warnings,trustedImages=new Set()}) {
  const sources=new Set();
  // Parse complete HTML, not individual inline tokens: tag pairs and tables can
  // span multiple Markdown tokens. This pass never reaches a browser.
  const cleaned=sanitizeHtml(html,{...options,transformTags:{'*':presentation,a:anchor,input:checkbox,img:(tag,attrs)=>{
    if(attrs.src)sources.add(attrs.src);
    return {tagName:tag,attribs:attrs};
  }}});
  const images=new Map();
  await Promise.all([...sources].map(async src=>{
    try{images.set(src,trustedImages.has(src)?src:await localImage(src,filename));}
    catch(error){warnings.push(`Image “${src}”: ${error.code==='ENOENT'?'file not found':error.message}`);}
  }));
  return sanitizeHtml(cleaned,{...options,transformTags:{'*':presentation,a:anchor,input:checkbox,img:(_tag,attrs)=>{
    const src=images.get(attrs.src);
    if(!src)return {tagName:'span',attribs:{class:'missing-image'},text:`[Image: ${attrs.alt||'image'}]`};
    return {tagName:'img',attribs:{...attrs,src}};
  }}});
}
