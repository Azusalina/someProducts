import {Parser, parseDocument} from 'htmlparser2';
import {getOuterHTML} from 'domutils';

export const SVG_LIMIT = 5 * 1024 * 1024;
export function svgImage(source) {
  if (Buffer.byteLength(source) > SVG_LIMIT) throw new Error('SVG exceeds the 5 MB image limit.');
  const document = parseDocument(source, {xmlMode:true});
  const roots = document.children.filter(node => node.type === 'tag');
  if (roots.length !== 1 || roots[0].name !== 'svg') throw new Error('Choose an SVG with one <svg> root.');
  const root = roots[0];
  root.attribs.xmlns = 'http://www.w3.org/2000/svg';
  root.attribs['xmlns:xlink'] ??= 'http://www.w3.org/1999/xlink';
  // Always use an image, never an SVG document/iframe: the browser's SVG image
  // context disables scripts, interaction and external resource loading.
  return `data:image/svg+xml;base64,${Buffer.from(getOuterHTML(root, {xmlMode:true})).toString('base64')}`;
}

export function embedInlineSvg(html, trustedImages, warnings) {
  const ranges = [];
  let start, depth = 0;
  const parser = new Parser({
    onopentag(name) { if (name.toLowerCase() === 'svg') { if (!depth) start = parser.startIndex; depth++; } },
    onclosetag(name) {
      if (name.toLowerCase() !== 'svg' || !depth || --depth) return;
      ranges.push([start, parser.endIndex + 1]);
    }
  }, {xmlMode:true, recognizeSelfClosing:true});
  parser.end(html);
  for (const [start, end] of ranges.reverse()) {
    let replacement;
    try {
      const data = svgImage(html.slice(start, end));
      trustedImages.add(data);
      replacement = `<img class="svg-image" src="${data}" alt="SVG drawing">`;
    } catch (error) {
      warnings.push(`SVG: ${error.message}`);
      replacement = '<span class="missing-image">[Invalid SVG]</span>';
    }
    html = html.slice(0, start) + replacement + html.slice(end);
  }
  return html;
}
