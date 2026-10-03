export const escapeHTML = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const bilingual = p => `${p.en}<span class="zh" lang="zh-Hant">${p.zh}</span>`;
export const label = (en,zh) => `${en}<span class="zh" lang="zh-Hant">${zh}</span>`;
export function renderMath(root) {
  if(window.renderMathInElement) window.renderMathInElement(root,{delimiters:[{left:'$$',right:'$$',display:true},{left:'\\(',right:'\\)',display:false}],throwOnError:false,strict:'ignore'});
}
export function latex(el,value) { if(window.katex) window.katex.render(value,el,{throwOnError:false,strict:'ignore',displayMode:false});else el.textContent=value; }
export function download(text,filename,type='text/plain') { const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500); }
