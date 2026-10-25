import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Scanner } from '../src/scanner.mjs';
export async function fixture() {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-manager-test-'));
  const write = async (file, content) => { const p = path.join(home, file); await fs.mkdir(path.dirname(p), {recursive:true}); await fs.writeFile(p, typeof content === 'string' ? content : JSON.stringify(content)); return p; };
  await write('.agents/skills/alpha/SKILL.md', '---\nname: alpha\ndescription: |\n  A shared writing workflow.\n  Supports multiple lines.\n---\n# Alpha\n\nRead [details](references/details.md).\n\n<script>window.compromised=true</script>\n\n![external](https://example.com/tracker.png)\n');
  await write('.agents/skills/alpha/references/details.md', '# Details\n\nLocal reference content.');
  await fs.mkdir(path.join(home, '.claude/skills'), {recursive:true});
  await fs.symlink(path.join(home, '.agents/skills/alpha'), path.join(home, '.claude/skills/alpha'));
  await fs.symlink(path.join(home, 'missing'), path.join(home, '.claude/skills/broken'));
  await write('.codex/skills/.system/system-skill/SKILL.md', '---\nname: system-skill\ndescription: Built-in skill\n---\n# System');
  const codexPlugin = '.codex/plugins/cache/market/demo/1.0';
  await write(`${codexPlugin}/.codex-plugin/plugin.json`, {name:'demo', description:'Demo plugin', version:'1.0', skills:'./workflows'});
  await write(`${codexPlugin}/workflows/review/SKILL.md`, '---\nname: review\ndescription: Review inside a plugin\n---\n# Review');
  await write(`${codexPlugin}/README.md`, '# Demo plugin\n\nPlugin documentation.');
  await write('.codex/config.toml', '[plugins."demo@market"]\nenabled = false\n[plugins."missing-plugin@market"]\nenabled = true\n');
  const claudePlugin = '.claude/plugins/cache/official/design/2.0';
  await write(`${claudePlugin}/.claude-plugin/plugin.json`, {name:'design', version:'2.0', description:'Design plugin'});
  await write(`${claudePlugin}/skills/draw/SKILL.md`, '---\nname: draw\ndescription: Drawing\n---\n# Draw');
  const project = path.join(home, 'Documents/project');
  await write('.claude/plugins/installed_plugins.json', {version:2, plugins:{'design@official':[{scope:'user',installPath:path.join(home,claudePlugin)},{scope:'project',projectPath:project,installPath:path.join(home,claudePlugin)}]}});
  await write('Documents/project/.claude/skills/local/SKILL.md', '---\nname: project-only\ndescription: Project skill\n---\n# Project');
  await write('secret.md', '# PRIVATE');
  await fs.symlink(path.join(home, 'secret.md'), path.join(home, '.agents/skills/alpha/leak.md'));
  const scanner = new Scanner({home, codexHome:path.join(home,'.codex'), claudeHome:path.join(home,'.claude'), systemRoots:[], discoverRoots:[home]});
  return {home, write, scanner, cleanup:() => fs.rm(home,{recursive:true,force:true})};
}
