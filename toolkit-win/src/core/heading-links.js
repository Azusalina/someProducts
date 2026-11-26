import {parseDocument} from 'htmlparser2';
import {findAll, getOuterHTML} from 'domutils';

export function resolveHeadingLinks(html, outline) {
  const document = parseDocument(html, {lowerCaseTags:false, lowerCaseAttributeNames:false});
  const ids = new Set(outline.map(heading => heading.id));
  for (const node of findAll(node => node.name === 'a' && node.attribs.href?.startsWith('#'), document.children)) {
    let target;
    try { target = decodeURIComponent(node.attribs.href.slice(1)); } catch { continue; }
    if (ids.has(target)) continue;
    const match = outline.find(heading => heading.label.trim().toLowerCase() === target.trim().toLowerCase());
    if (match) node.attribs.href = '#' + encodeURIComponent(match.id);
  }
  return document.children.map(node => getOuterHTML(node, {selfClosingTags:true})).join('');
}
