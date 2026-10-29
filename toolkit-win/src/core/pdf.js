import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { browserCandidates } from '../platform/runtime.js';
import { chromium } from 'playwright-core';

export async function findChromium({allowEdge=true}={}) {
  const candidates = browserCandidates({managed:chromium.executablePath()});
  for (const executable of candidates) {
    if(!allowEdge&&/msedge|microsoft.edge/i.test(executable))continue;
    try { await access(executable, constants.X_OK); return executable; } catch {}
  }
  if(!allowEdge)throw new Error('Scribd needs Chrome/Chromium and a matching ChromeDriver. Run npm run browser:setup, then configure TOOLKIT_CHROMEDRIVER.');
  throw new Error('PDF/Markdown diagram rendering needs Edge, Chrome or Chromium. Run npm run browser:setup, or set TOOLKIT_CHROMIUM to the browser executable. JS/MJS to SVG works directly in Firefox without this dependency.');
}

export function documentHtml(html, style, { paper = 'A4', title = 'Document', background = 'white' } = {}) {
  if (!['A4', 'Letter'].includes(paper)) throw new Error('Choose A4 or Letter paper.');
  const colors = { white: '#ffffff', yellow: '#fff4cc', black: '#161616' };
  if (!Object.hasOwn(colors, background)) throw new Error('Choose white, yellow, or black PDF background.');
  const escapedTitle = title.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; base-uri 'none'; form-action 'none'"><title>${escapedTitle}</title><style>${style}\n@page { size: ${paper}; margin: 18mm; background: ${colors[background]}; }</style></head><body class="document-theme-${background}"><article class="document">${html}</article></body></html>`;
}

export async function exportPdf(html, style, options) {
  const executablePath = await findChromium();
  const browser = await chromium.launch({ executablePath, headless: true, timeout: 20000 });
  try {
    const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' });
    // Never navigate to the source file or a document server: all content stays in memory.
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    await session.send('Network.enable');
    await session.send('Network.setCacheDisabled', { cacheDisabled: true });
    await page.setContent(documentHtml(html, style, options), { waitUntil: 'load', timeout: 15000 });
    return await page.pdf({ format: options.paper, preferCSSPageSize: true, printBackground: true, timeout: 20000 });
  } finally { await browser.close(); }
}
