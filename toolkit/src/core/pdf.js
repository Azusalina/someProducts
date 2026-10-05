import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { chromium } from 'playwright-core';

export async function findChromium() {
  const candidates = [process.env.TOOLKIT_CHROMIUM, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/opt/google/chrome/chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  for (const executable of candidates) {
    try { await access(executable, constants.X_OK); return executable; } catch {}
  }
  throw new Error('PDF export needs Chrome or Chromium. Install it or set TOOLKIT_CHROMIUM to its executable path.');
}

export function documentHtml(html, style, { paper = 'A4', title = 'Document' } = {}) {
  if (!['A4', 'Letter'].includes(paper)) throw new Error('Choose A4 or Letter paper.');
  const escapedTitle = title.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; base-uri 'none'; form-action 'none'"><title>${escapedTitle}</title><style>${style}\n@page { size: ${paper}; margin: 18mm; }</style></head><body><article class="document">${html}</article></body></html>`;
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
