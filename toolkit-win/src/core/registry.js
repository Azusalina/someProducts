import path from 'node:path';
import { markdownModule } from '../modules/markdown/index.js';
import { texModule } from '../modules/tex/index.js';

export class ModuleRegistry {
  constructor(modules = [markdownModule, texModule]) { this.modules = modules; }
  list() { return this.modules.map(({ id, name, extensions, outputs }) => ({ id, name, extensions, outputs })); }
  forFile(filename) {
    const extension = path.extname(filename).toLowerCase();
    const module = this.modules.find(item => item.extensions.includes(extension));
    if (!module) throw new Error(`Unsupported file type “${extension || '(none)'}”. Choose Markdown (.md or .markdown) or TeX (.tex).`);
    return module;
  }
}
