import { open, realpath, readFile } from 'node:fs/promises';
import path from 'node:path';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export async function readSource(filename) {
  const handle = await open(filename, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error('Choose a regular file.');
    if (stat.size > MAX_FILE_BYTES) throw new Error('File exceeds the 5 MB preview limit.');
    // Read a bounded buffer even if another process grows the file during the read.
    const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_FILE_BYTES) throw new Error('File exceeds the 5 MB preview limit.');
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally { await handle.close(); }
}

const imageTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif' };
export async function localImage(src, filename) {
  if (/^data:image\/(png|jpeg|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i.test(src)) return src;
  if (/^[a-z][a-z0-9+.-]*:|^\/|^\\/i.test(src)) throw new Error('Only relative local images are supported.');
  const root = await realpath(path.dirname(filename));
  const candidate = await realpath(path.resolve(root, decodeURIComponent(src)));
  const relative = path.relative(root, candidate);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Image is outside the document folder.');
  const mime = imageTypes[path.extname(candidate).toLowerCase()];
  if (!mime) throw new Error('Use PNG, JPEG, GIF, WebP or AVIF images.');
  const handle = await open(candidate, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw new Error('Image exceeds the 5 MB limit.');
    const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_FILE_BYTES) throw new Error('Image exceeds the 5 MB limit.');
    return `data:${mime};base64,${buffer.subarray(0, bytesRead).toString('base64')}`;
  } finally { await handle.close(); }
}

export async function documentStyle() {
  return readFile(new URL('../../public/document.css', import.meta.url), 'utf8');
}
