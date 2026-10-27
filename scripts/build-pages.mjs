import { cp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '.pages-dist');
const sites = {
  ba: ['index.html', 'app.js', 'lessons.js', 'style.css', 'vendor'],
  gitpop: ['dist'],
  ict: ['index.html', 'favicon.svg', 'app.js', 'lessons.js', 'style.css', 'vendor'],
  la: ['index.html', 'notes.html', 'playground.html', 'styles.css', 'assets', 'js', 'vendor', 'examples', 'ref'],
  'Visualize-graph': ['index.html', 'style.css', 'app.js', 'math.js', 'stats.js', 'complex.js', 'latex.js', 'editor.js', 'plot.js', 'vendor'],
  todos: ['product1'],
  'yupi-econ': ['claude-product/study-site'],
  'balladeIV-liebe': ['web'],
  hku: ['index.html', 'app.js', 'model.js', 'style.css', 'data'],
  'ict-notes': ['learn']
};

function run(cwd, args) {
  const result = spawnSync(process.execPath, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Check failed in ${cwd}: node ${args.join(' ')}`);
}

const exists = async file => !!(await stat(file).catch(() => null));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const [name, files] of Object.entries(sites)) {
  const original = name === 'balladeIV-liebe' ? 'balldeIV' : name;
  const source = path.join(root, await exists(path.join(root, `d-${name}`)) ? `d-${name}` : original);
  if (['balladeIV-liebe', 'hku', 'ict-notes'].includes(name)) {
    run(root, ['scripts/check-additional-sites.mjs', name, source]);
    if (name === 'hku') run(source, ['--test', 'tests/model.test.cjs']);
  } else if (name === 'yupi-econ') {
    run(root, ['scripts/check-yupi-econ.mjs', source]);
  } else if (name === 'Visualize-graph') {
    for (const file of ['app.js', 'math.js', 'stats.js', 'complex.js', 'latex.js', 'editor.js', 'plot.js']) run(source, ['--check', file]);
    for (const file of ['math', 'stats', 'complex', 'latex', 'sum', 'intersections']) run(source, [`tests/${file}.test.cjs`]);
  } else if (name === 'todos') {
    run(source, ['tests/check_static.mjs']);
  } else if (name === 'gitpop') {
    run(source, ['--test', 'test/discovery.test.js']);
    run(source, ['scripts/build.mjs']);
  } else if (name === 'la') {
    run(source, ['--test', 'tests/math.test.mjs']);
  } else {
    for (const file of ['app.js', 'lessons.js']) run(source, ['--check', file]);
  }
  const target = path.join(output, name);
  await mkdir(target, { recursive: true });
  if (name === 'balladeIV-liebe') await cp(path.join(source, 'web'), target, { recursive: true });
  else if (name === 'ict-notes') await cp(path.join(source, 'learn'), target, { recursive: true });
  else if (name === 'yupi-econ') await cp(path.join(source, 'claude-product/study-site'), target, { recursive: true });
  else if (name === 'todos') await cp(path.join(source, 'product1'), target, { recursive: true });
  else if (name === 'gitpop') await cp(path.join(source, 'dist'), target, { recursive: true });
  else for (const file of files) await cp(path.join(source, file), path.join(target, file), { recursive: true });
  console.log(`Packaged ${path.basename(source)} → /${name}/`);
}
await cp(path.join(root, 'pages/index.html'), path.join(output, 'index.html'));
await writeFile(path.join(output, '.nojekyll'), '');
const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
if (revision.status !== 0) throw new Error('Unable to identify the deployed revision');
await writeFile(path.join(output, 'deployment.json'), JSON.stringify({
  commit: revision.stdout.trim(), paths: Object.keys(sites)
}, null, 2) + '\n');
console.log(`GitHub Pages output: ${output}`);
