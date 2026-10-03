import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
await mkdir(dist, { recursive: true });
for (const file of ['index.html', 'style.css', 'favicon.svg', 'src']) await cp(path.join(root, file), path.join(dist, file), { recursive: true });
console.log('Built Gitpop → dist/ (static hosting, no backend required)');
