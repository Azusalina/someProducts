// One-based original page numbers, in output order.
export function parsePages(text, count) {
  if (!Number.isInteger(count) || count < 1) throw new Error('Open a PDF first.');
  if (!text.trim()) throw new Error('Enter page numbers, for example 1-3, 7, 5.');
  const pages = [], seen = new Set();
  for (const part of text.split(',')) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error('Use page numbers and ranges separated by commas.');
    const start = Number(match[1]), end = Number(match[2] ?? match[1]);
    if (start < 1 || end < 1 || start > count || end > count) throw new Error(`Pages must be between 1 and ${count}.`);
    const step = start <= end ? 1 : -1;
    for (let page = start; ; page += step) {
      if (seen.has(page)) throw new Error(`Page ${page} appears more than once.`);
      seen.add(page); pages.push(page);
      if (page === end) break;
    }
  }
  return pages;
}

export async function extractPages(PDFDocument, original, pages) {
  if (!pages.length) throw new Error('Keep at least one page before saving.');
  const count = original.getPageCount();
  if (new Set(pages).size !== pages.length || pages.some(p => !Number.isInteger(p) || p < 1 || p > count)) throw new Error('Invalid page selection.');
  const output = await PDFDocument.create();
  for (const page of await output.copyPages(original, pages.map(p => p - 1))) output.addPage(page);
  return output.save();
}
