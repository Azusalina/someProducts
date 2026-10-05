#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { createToolkit } from './server.js';

try {
  const { values, positionals } = parseArgs({ options: { port: { type: 'string', default: '4177' }, interval: { type: 'string', default: '300' }, help: { type: 'boolean', short: 'h' } }, allowPositionals: true });
  if (values.help) {
    console.log('Usage: npm start -- [file.md] [--port 4177] [--interval 300]\n\nOpen the printed URL. Edit and save the file in your editor.\nPreview stays in memory; PDF is generated only when Export PDF is clicked.\nTOOLKIT_CHROMIUM: optional path to Chrome/Chromium for PDF export.');
  } else {
    const port = Number(values.port), interval = Number(values.interval);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Port must be between 0 and 65535.');
    if (!Number.isInteger(interval) || interval < 100 || interval > 10000) throw new Error('Interval must be between 100 and 10000 ms.');
    if (positionals.length > 1) throw new Error('Pass one target file.');
    const app = await createToolkit({ port, interval, filename: positionals[0] });
    console.log(`\nLocal Toolkit\n${app.url}\n\nEdit and save your Markdown file to update the preview.\nPress Ctrl+C to stop.\n`);
    let closing = false;
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
      if (closing) return;
      closing = true;
      await app.close();
      process.exit(0);
    });
  }
} catch (error) { console.error(`Toolkit: ${error.message}`); process.exitCode = 1; }
