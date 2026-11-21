import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';

let cached;
export function mathStyle() {
  return cached ??= (async () => {
    const folder = path.join(path.dirname(createRequire(import.meta.url).resolve('katex/package.json')), 'dist');
    let css = await readFile(path.join(folder, 'katex.min.css'), 'utf8');
    const fonts = new Map();
    for (const match of css.matchAll(/url\((fonts\/[^)]+\.woff2)\)/g)) {
      fonts.set(match[1], `data:font/woff2;base64,${(await readFile(path.join(folder, match[1]))).toString('base64')}`);
    }
    // One embedded WOFF2 source per face; no network or filesystem font access
    // is needed in sandboxed Markdown previews or the offline PDF browser.
    css = css.replace(/src:[^;}]*/g, declaration => {
      const font = /url\((fonts\/[^)]+\.woff2)\)/.exec(declaration)?.[1];
      if (!fonts.has(font)) throw new Error('Unsupported KaTeX font declaration.');
      return `src:url(${fonts.get(font)}) format("woff2")`;
    });
    return css;
  })();
}
