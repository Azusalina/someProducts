import { parse } from 'acorn';

const functions = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const symbols = ['&', '"', '#', '<', '>', '\\', '`'];
const escape = value => value.replace(/[&"#<>\\`]/g, c => String.fromCharCode(0xe000 + symbols.indexOf(c)));
// Restore only XML-escaped text, never markup. Single-character placeholders keep
// Mermaid's text wrapping from splitting escaped operators and string quotes.
export const restoreCodeLabels = svg => svg.replace(/[\uE000-\uE006]/g, c => ['&amp;', '&quot;', '#', '&lt;', '&gt;', '\\', '`'][c.charCodeAt(0) - 0xe000]);

// Static syntax analysis only. User code is never imported or executed.
export function codeFlowchart(source, filename = 'code.js') {
  if (typeof source !== 'string' || !source.trim()) throw new Error('Choose a JS/MJS file or enter code.');
  if (Buffer.byteLength(source) > 100 * 1024) throw new Error('Choose code up to 100 KB.');
  if (/[\uE000-\uE006]/.test(source + filename)) throw new Error('Code contains unsupported private-use characters.');
  let tree;
  try { tree = parse(source, { ecmaVersion: 'latest', sourceType: 'module' }); }
  catch (error) {
    if (/\.mjs$/i.test(filename)) throw new Error(`Invalid JavaScript: ${error.message}`);
    try { tree = parse(source, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true }); }
    catch { throw new Error(`Invalid JavaScript: ${error.message}`); }
  }
  const lines = ['flowchart TD']; let serial = 0, edges = 0;
  const text = node => source.slice(node.start, node.end).replace(/\s+/g, ' ').trim();
  function node(label, shape = 'box') {
    if (++serial > 250) throw new Error('Flowchart exceeds 250 nodes. Convert a smaller section.');
    const id = `n${serial}`, clean = escape(label.length > 160 ? `${label.slice(0,157)}…` : label);
    lines.push(shape === 'decision' ? `${id}{"${clean}"}` : shape === 'end' ? `${id}(["${clean}"])` : `${id}["${clean}"]`);
    return id;
  }
  function edge(from, to, label) {
    if (!from || !to) return;
    if (++edges > 480) throw new Error('Flowchart is too complex. Convert a smaller section.');
    lines.push(`${from} -->${label ? `|"${escape(label)}"|` : ''} ${to}`);
  }
  function sequence(body, next, ctx) {
    for (let i = body.length - 1; i >= 0; i--) next = statement(body[i], next, ctx);
    return next;
  }
  function statement(s, next, ctx) {
    if (!s) return next;
    switch (s.type) {
      case 'EmptyStatement': return next;
      case 'BlockStatement': return sequence(s.body, next, ctx);
      case 'ExportNamedDeclaration': case 'ExportDefaultDeclaration':
        if (s.declaration) return statement(s.declaration, next, ctx);
        break;
      case 'IfStatement': {
        const test = node(text(s.test), 'decision');
        edge(test, statement(s.consequent, next, ctx), 'true');
        edge(test, statement(s.alternate, next, ctx), 'false'); return test;
      }
      case 'ForStatement': case 'WhileStatement': case 'DoWhileStatement': case 'ForOfStatement': case 'ForInStatement': {
        const iterates = ['ForOfStatement', 'ForInStatement'].includes(s.type);
        const test = node(iterates ? `${text(s.left)} ${s.type === 'ForOfStatement' ? 'of' : 'in'} ${text(s.right)}` : s.test ? text(s.test) : 'true', 'decision');
        let update = test;
        if (s.update) { update = node(text(s.update)); edge(update, test); }
        const body = statement(s.body, update, { ...ctx, break: next, continue: update });
        edge(test, body, iterates ? 'next' : 'true');
        if (s.test || iterates) edge(test, next, iterates ? 'done' : 'false');
        if (s.type === 'DoWhileStatement') return body;
        if (s.init) { const init = node(text(s.init)); edge(init, test); return init; }
        return test;
      }
      case 'SwitchStatement': {
        const test = node(text(s.discriminant), 'decision');
        let following = next, hasDefault = false;
        for (let i = s.cases.length - 1; i >= 0; i--) {
          const item = s.cases[i];
          const entry = sequence(item.consequent, following, { ...ctx, break: next });
          edge(test, entry, item.test ? text(item.test) : 'default');
          if (!item.test) hasDefault = true;
          following = entry;
        }
        if (!hasDefault) edge(test, next, 'default');
        return test;
      }
      case 'ReturnStatement': case 'ThrowStatement': {
        const id = node(text(s)); edge(id, s.type === 'ReturnStatement' ? ctx.end : ctx.thrown); return id;
      }
      case 'BreakStatement': case 'ContinueStatement': {
        if (s.label) throw new Error('Labeled break/continue is not supported. Convert the containing loop separately.');
        const id = node(text(s)); edge(id, s.type === 'BreakStatement' ? ctx.break : ctx.continue); return id;
      }
      case 'LabeledStatement': return statement(s.body, next, ctx);
    }
    let label = text(s);
    if (functions.has(s.type)) label = `${s.async ? 'async ' : ''}function ${s.id?.name || ''}(${s.params.map(text).join(', ')})`;
    // Compound exception handling stays a single atomic block. Do not invent
    // catch/finally edges or imply every potentially throwing call succeeds.
    const id = node(label); edge(id, next); return id;
  }
  const discovered = [];
  function walk(value, hint = '', depth = 0) {
    if (!value || typeof value !== 'object') return;
    if (depth > 200) throw new Error('Code nesting is too deep.');
    if (Array.isArray(value)) { for (const child of value) walk(child, hint, depth + 1); return; }
    if (functions.has(value.type)) {
      if (discovered.length >= 40) throw new Error('Code contains more than 40 functions. Convert a smaller section.');
      discovered.push({ value, name: value.id?.name || hint || `λ ${source.slice(0,value.start).split('\n').length}` });
    }
    for (const [key, child] of Object.entries(value)) {
      if (!child || typeof child !== 'object') continue;
      let name = '';
      if (key === 'init' && value.type === 'VariableDeclarator') name = text(value.id);
      if (key === 'right' && value.type === 'AssignmentExpression') name = text(value.left);
      if (key === 'value' && ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(value.type)) name = text(value.key);
      walk(child, name, depth + 1);
    }
  }
  walk(tree);
  function section(title, body, expression = false) {
    const offset = lines.length;
    lines.push(`subgraph g${serial}["${escape(title.replace(/[\r\n]/g,' ').slice(0,160))}"]`);
    const start = node('Start', 'end'), end = node('End', 'end'), thrown = node('throw', 'end');
    const ctx = { end, thrown };
    let first;
    if (expression) { first = node(text(body)); edge(first, end); }
    else first = sequence(body, end, ctx);
    edge(start, first); lines.push('end');
    // Keep only paths reachable from this section's Start node; statements after
    // unconditional return/throw/break must not appear as executable paths.
    const sectionLines = lines.slice(offset), outgoing = new Map();
    for (const line of sectionLines) {
      const match = line.match(/^(n\d+) -->(?:\|"[^"\n]*"\|)? (n\d+)$/);
      if (match) outgoing.set(match[1], [...(outgoing.get(match[1]) || []), match[2]]);
    }
    const reachable = new Set(), queue = [start];
    while (queue.length) {
      const id = queue.pop(); if (reachable.has(id)) continue;
      reachable.add(id); queue.push(...(outgoing.get(id) || []));
    }
    lines.splice(offset, sectionLines.length, ...sectionLines.filter(line => {
      const id = line.match(/^(n\d+)(?:[\[({]| -->)/)?.[1];
      return !id || reachable.has(id);
    }));
  }
  section(filename, tree.body);
  for (const { value, name } of discovered) section(`${name}(${value.params.map(text).join(', ')})`, value.body.type === 'BlockStatement' ? value.body.body : value.body, value.body.type !== 'BlockStatement');
  return lines.join('\n');
}
