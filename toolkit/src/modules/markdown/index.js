import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import hljs from 'highlight.js';
import { localImage } from '../../core/files.js';
import { renderMermaid } from '../../core/mermaid.js';

const md = new MarkdownIt({
  html: false, linkify: true, typographer: true,
  highlight(code, language) {
    return language && hljs.getLanguage(language)
      ? hljs.highlight(code, { language, ignoreIllegals: true }).value : '';
  }
}).use(taskLists);
const defaultLink = md.renderer.rules.link_open;
md.renderer.rules.link_open = (tokens, index, options, env, self) => {
  const href = tokens[index].attrGet('href');
  if (href && !href.startsWith('#')) {
    if (!/^(https?:|mailto:)/i.test(href)) tokens[index].attrSet('href', '#');
    else {
      tokens[index].attrSet('target', '_blank');
      tokens[index].attrSet('rel', 'noopener noreferrer');
    }
  }
  return defaultLink ? defaultLink(tokens, index, options, env, self) : self.renderToken(tokens, index, options);
};
const defaultImage = md.renderer.rules.image;
md.renderer.rules.image = (tokens, index, options, env, self) => {
  if (!tokens[index].attrGet('src')) return `<span class="missing-image">[Image: ${md.utils.escapeHtml(tokens[index].content)}]</span>`;
  return defaultImage(tokens, index, options, env, self);
};
const defaultFence = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, index, options, env, self) => {
  const token = tokens[index];
  if (!token.mermaidSvg) return defaultFence(tokens, index, options, env, self);
  const data = Buffer.from(token.mermaidSvg).toString('base64');
  return `<figure class="mermaid-diagram"><img src="data:image/svg+xml;base64,${data}" alt="Mermaid diagram"></figure>\n`;
};

function renderSections(tokens) {
  const parts = [];
  let start = 0, inSection = false;
  function append(end) {
    const html = md.renderer.render(tokens.slice(start, end), md.options, {});
    parts.push(inSection ? `<section class="document-section">\n${html}</section>\n` : html);
  }
  for (let i = 0; i < tokens.length; i++) {
    // Keep lists and blockquotes intact; their internal headings are not
    // boundaries between document sections. Every top-level heading level is.
    if (tokens[i].type !== 'heading_open' || tokens[i].level !== 0) continue;
    append(i);
    start = i;
    inSection = true;
  }
  append(tokens.length);
  return parts.join('');
}

export const markdownModule = {
  id: 'markdown', name: 'Markdown', extensions: ['.md', '.markdown'], outputs: ['pdf'],
  async render(source, { filename }) {
    const tokens = md.parse(source, {});
    const outline = [], warnings = [], counts = new Map();
    const imageJobs = [], diagrams = [];
    function visit(items) {
      for (let i = 0; i < items.length; i++) {
        const token = items[i];
        if (token.type === 'fence' && token.info.trim().split(/\s+/)[0].toLowerCase() === 'mermaid') diagrams.push(token);
        if (token.type === 'heading_open') {
          const label = items[i + 1]?.content || 'Heading';
          const slug = label.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'heading';
          const count = (counts.get(slug) || 0) + 1;
          counts.set(slug, count);
          const id = count === 1 ? slug : `${slug}-${count}`;
          token.attrSet('id', id);
          outline.push({ id, label, level: Number(token.tag.slice(1)) });
        }
        if (token.type === 'image') imageJobs.push((async () => {
          const src = token.attrGet('src');
          try { token.attrSet('src', await localImage(src, filename)); }
          catch (error) { token.attrSet('src', ''); warnings.push(`Image “${src}”: ${error.code === 'ENOENT' ? 'file not found' : error.message}`); }
        })());
        if (token.children) visit(token.children);
      }
    }
    visit(tokens);
    await Promise.all(imageJobs);
    const rendered = await renderMermaid(diagrams.map(token => token.content));
    for (const [index, result] of rendered.entries()) {
      if (result.svg) diagrams[index].mermaidSvg = result.svg;
      else warnings.push(`Mermaid diagram ${index + 1}: ${result.error} Source is shown instead.`);
    }
    return { html: renderSections(tokens), outline, warnings, title: outline[0]?.label || 'Untitled document' };
  }
};
