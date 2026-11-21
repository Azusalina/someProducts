import {randomUUID} from 'node:crypto';
import katex from 'katex';

export function renderMath(content, displayMode, env) {
  let html;
  try {
    html = katex.renderToString(content, {displayMode, output:'htmlAndMathml',
      trust:false, strict:'ignore', throwOnError:true, maxSize:20, maxExpand:1000, macros:{}});
  } catch (error) {
    env.warnings.push(`Math: ${error.message.slice(0, 240)}`);
    const escaped = content.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    return `<${displayMode ? 'pre' : 'code'} class="math-error">${escaped}</${displayMode ? 'pre' : 'code'}>`;
  }
  // Only renderer-generated formulas bypass the document HTML sanitizer. A new
  // unpredictable marker per formula prevents source HTML from impersonating it.
  const id = `toolkit-math-${randomUUID()}`;
  env.math.set(id, html);
  return `<span id="${id}"></span>`;
}

export function restoreMath(html, env) {
  return html.replace(/<span id="(toolkit-math-[\da-f-]+)"><\/span>/g,
    (marker, id) => env.math.get(id) ?? marker);
}
