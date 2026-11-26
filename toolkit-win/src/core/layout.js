import {createHash} from 'node:crypto';
import {parseDocument} from 'htmlparser2';
import {getOuterHTML, textContent, findAll} from 'domutils';

const element = node => node.type === 'tag';
const serialize = nodes => nodes.map(node => getOuterHTML(node, {selfClosingTags:true})).join('\n');
function flowNodes(nodes) {
  return nodes.flatMap(node => element(node) && node.name === 'section' && (node.attribs.class || '').split(/\s+/).includes('document-section')
    ? flowNodes(node.children) : element(node) || node.type === 'text' && node.data.trim() ? [node] : []);
}
function grouped(nodes) {
  const groups = []; let current = [], heading = false, forced = false;
  const flush = () => {
    if (!current.length) return;
    const html = serialize(current);
    groups.push(heading || forced ? `<section class="document-section${forced ? ' manual-page-start' : ''}">\n${html}</section>` : html);
    current = [];
  };
  for (const node of nodes) {
    const nextHeading = element(node) && /^h[1-6]$/.test(node.name);
    const nextForced = element(node) && node.attribs['data-page-start'] === 'true';
    if (nextHeading || nextForced) { flush(); heading = nextHeading; forced = nextForced && groups.length > 0; }
    current.push(node);
  }
  flush(); return groups.join('\n');
}
export function annotateLayout(html, filename, source) {
  const nodes = flowNodes(parseDocument(html, {lowerCaseTags:false, lowerCaseAttributeNames:false}).children), blocks = [], kept = [];
  let pageStart = false, rootIndex = 0;
  function mark(node, id, parent = null) {
    node.attribs['data-layout-id'] = id;
    const kind = node.name === 'img' ? 'image' : node.name === 'table' ? 'table' : /^h[1-6]$/.test(node.name) ? 'heading' : 'text';
    blocks.push({id, parent, kind, label:(node.attribs.alt || textContent(node) || node.name).trim().replace(/\s+/g, ' ').slice(0, 70)});
  }
  for (const node of nodes) {
    if (!element(node)) { kept.push(node); continue; }
    if ((node.attribs.class || '').split(/\s+/).includes('toolkit-page-break')) { pageStart = true; continue; }
    if (pageStart) { node.attribs['data-page-start'] = 'true'; pageStart = false; }
    const id = `block-${rootIndex++}`;
    mark(node, id);
    const nested = findAll(child => element(child) && ['img', 'table'].includes(child.name), node.children);
    nested.forEach((child, index) => mark(child, `${id}-${index}`, id));
    kept.push(node);
  }
  return {html:grouped(kept), layoutBlocks:blocks,
    layoutRevision:createHash('sha256').update(filename + '\0' + source).digest('hex')};
}

export function normalizeLayout(value, state) {
  if (value?.revision !== state.layoutRevision) throw Object.assign(new Error('The document changed. Select the content again.'), {status:409});
  if (value.reset === true) return null;
  const roots = state.layoutBlocks.filter(block => !block.parent).map(block => block.id), known = new Set(state.layoutBlocks.map(block => block.id));
  const rootIds = new Set(roots);
  if (!Array.isArray(value.order) || value.order.length !== roots.length || new Set(value.order).size !== roots.length || value.order.some(id => !rootIds.has(id))) throw new Error('Invalid content order.');
  if (!value.blocks || typeof value.blocks !== 'object' || Array.isArray(value.blocks)) throw new Error('Invalid layout adjustments.');
  const blocks = {};
  for (const [id, changes] of Object.entries(value.blocks)) {
    if (!known.has(id) || !changes || typeof changes !== 'object') throw new Error('Unknown layout content.');
    const clean = {};
    for (const [key, bound] of Object.entries({x:[-180,180], y:[-250,250], width:[5,100], height:[1,300]})) {
      if (changes[key] == null) continue;
      if (typeof changes[key] !== 'number' || !Number.isFinite(changes[key]) || changes[key] < bound[0] || changes[key] > bound[1]) throw new Error(`Invalid ${key} adjustment.`);
      clean[key] = Math.round(changes[key] * 10) / 10;
    }
    if (changes.align != null) {
      if (!['left','center','right'].includes(changes.align)) throw new Error('Invalid alignment.');
      clean.align = changes.align;
    }
    for (const key of ['pageBefore','keepNext']) if (changes[key] != null) {
      if (typeof changes[key] !== 'boolean') throw new Error('Invalid page layout.');
      clean[key] = changes[key];
    }
    blocks[id] = clean;
  }
  return {revision:value.revision, order:[...value.order], blocks};
}

export function applyLayout(html, layout) {
  if (!layout) return html;
  const nodes = flowNodes(parseDocument(html, {lowerCaseTags:false, lowerCaseAttributeNames:false}).children), rank = new Map(layout.order.map((id, i) => [id, i]));
  const all = findAll(node => element(node) && Boolean(node.attribs['data-layout-id']), nodes);
  for (const node of all) {
    const change = layout.blocks[node.attribs['data-layout-id']];
    if (!change) continue;
    const css = [];
    if (change.x != null || change.y != null) css.push(`transform:translate(${change.x || 0}mm,${change.y || 0}mm)`);
    if (change.width != null) css.push(`width:${change.width}%`);
    if (change.height != null) css.push(`height:${change.height}mm`, 'max-height:none');
    if (change.align) {
      if (['img','table'].includes(node.name)) css.push(`margin-left:${change.align === 'left' ? '0' : 'auto'}`, `margin-right:${change.align === 'right' ? '0' : 'auto'}`);
      else css.push(`text-align:${change.align}`);
    }
    if (change.keepNext != null) css.push(`break-after:${change.keepNext ? 'avoid' : 'auto'}`);
    if (change.pageBefore != null) node.attribs['data-page-start'] = String(change.pageBefore);
    node.attribs.style = [node.attribs.style, ...css].filter(Boolean).join(';');
  }
  nodes.sort((a, b) => (rank.get(a.attribs?.['data-layout-id']) ?? -1) - (rank.get(b.attribs?.['data-layout-id']) ?? -1));
  return grouped(nodes);
}
