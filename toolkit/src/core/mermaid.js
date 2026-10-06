import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { findChromium } from './pdf.js';

let library;
const MAX_DIAGRAM_CHARS = 50000;

// Render trusted library code in an isolated, offline browser. Documents only
// receive inert SVG image data, keeping preview/PDF JavaScript disabled.
export async function renderMermaid(sources) {
  if (!sources.length) return [];
  const results = [];
  let browser;
  try {
    browser = await chromium.launch({ executablePath: await findChromium(), headless: true, timeout: 20000 });
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1000, height: 800 } });
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
    library ??= await readFile(new URL('./mermaid.min.js', import.meta.resolve('mermaid')), 'utf8');
    await page.addScriptTag({ content: library });
    for (const [index, source] of sources.entries()) {
      if (source.length > MAX_DIAGRAM_CHARS) {
        results.push({ error: 'Diagram exceeds the 50,000 character limit.' });
        continue;
      }
      let timer;
      try {
        const result = await Promise.race([
          page.evaluate(async ({ source, index }) => {
            document.body.replaceChildren();
            window.mermaid.initialize({
              startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true,
              theme: 'neutral', look: 'classic', fontFamily: 'Noto Sans, Noto Sans CJK TC, system-ui, sans-serif',
              htmlLabels: false, flowchart: { htmlLabels: false },
              maxTextSize: 50000, maxEdges: 500,
              secure: ['secure', 'securityLevel', 'startOnLoad', 'suppressErrorRendering', 'maxTextSize', 'maxEdges', 'theme', 'themeVariables', 'look', 'fontFamily', 'htmlLabels', 'flowchart']
            });
            try {
              const { svg } = await window.mermaid.render(`diagram-${index}`, source);
              const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
              const root = document.documentElement;
              if (root.tagName !== 'svg') throw new Error('Diagram did not produce an SVG.');
              // Explicit intrinsic size keeps SVG images legible and responsive.
              const viewBox = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
              if (viewBox?.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
                root.setAttribute('width', String(Math.ceil(viewBox[2])));
                root.setAttribute('height', String(Math.ceil(viewBox[3])));
              }
              return { svg: new XMLSerializer().serializeToString(root) };
            } catch (error) { return { error: String(error.message || error).slice(0, 500) }; }
          }, { source, index }),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Diagram rendering timed out.')), 10000); })
        ]);
        results.push(result);
      } finally { clearTimeout(timer); }
    }
  } catch (error) {
    while (results.length < sources.length) results.push({ error: error.message });
  } finally { await browser?.close(); }
  return results;
}
