#!/usr/bin/env node
// Dependency-free static validation. Run from any working directory.
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, dirname, extname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
export async function validate() {
  const errors = [];
  const fail = message => errors.push(message);
  const contents = new Map();
  for (const name of ['index.html', 'deck.css', 'deck.js']) {
    try { contents.set(name, await readFile(resolve(root, name), 'utf8')); }
    catch { fail(`Missing ${name}. Finish building the deck before validating or exporting.`); }
  }
  const html = contents.get('index.html') || '';
  const sections = [...html.matchAll(/<section\b[^>]*>/gi)].filter(([tag]) => /\bclass\s*=\s*["'][^"']*\bslide\b[^"']*["']/i.test(tag));
  if (contents.has('index.html') && sections.length !== 12) fail(`Expected 12 section.slide elements, found ${sections.length}.`);
  const css = contents.get('deck.css') || '';
  if (contents.has('deck.css') && (!/@media\s+print\b/i.test(css) || !/@page\b/i.test(css))) fail('deck.css must define @media print and @page for PDF export.');
  if (contents.has('deck.css') && !/size\s*:\s*1600px\s+900px/i.test(css)) fail('Print @page size must be 1600px 900px.');
  async function scan(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) await scan(path);
      else if (['.html', '.css', '.js', '.svg'].includes(extname(path))) {
        const text = await readFile(path, 'utf8');
        const name = relative(root, path);
        // XML namespace identifiers are not fetched dependencies.
        const cleaned = text.replace(/\sxmlns(?::[\w-]+)?\s*=\s*["'][^"']*["']/gi, '');
        if (/https?:\/\/[^\s<>"']+|["'(=]\s*\/\/[^\s<>"']+/i.test(cleaned)) fail(`${name}: remote URL or dependency is not allowed.`);
        if (/\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{20,})\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:api[_-]?key|secret|access[_-]?token|password)\s*[:=]\s*["'][^"']{8,}["']/i.test(text)) fail(`${name}: possible embedded secret.`);
        const refs = [...text.matchAll(/\b(?:src|href|poster)\s*=\s*["']([^"']+)["']|url\(\s*["']?([^\s)'";]+)["']?\s*\)/gi)];
        for (const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|@import\s+|\bfetch\(\s*)["']([^"']+)["']/g)) refs.push([match[0], match[1]]);
        for (const match of refs) {
          const ref = match[1] || match[2];
          if (/^(?:#|data:|https?:|\/\/|mailto:|tel:)/i.test(ref)) continue;
          if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) { fail(`${name}: nonlocal resource scheme: ${ref}`); continue; }
          const bare = ref.split(/[?#]/)[0];
          if (!bare) continue;
          let target;
          try { target = resolve(dirname(path), decodeURIComponent(bare)); }
          catch { fail(`${name}: invalid asset path ${ref}`); continue; }
          if (target !== root && !target.startsWith(root + sep)) { fail(`${name}: asset escapes deck folder: ${ref}`); continue; }
          try { if (!(await stat(target)).isFile()) fail(`${name}: asset is not a file: ${ref}`); }
          catch { fail(`${name}: missing local asset ${ref}`); }
        }
        if (extname(path) === '.js') {
          const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
          if (result.status !== 0) fail(`${name}: JavaScript syntax check failed: ${result.stderr || result.error}`);
        }
      }
    }
  }
  await scan(root);
  if (errors.length) throw new Error(errors.join('\n'));
  return { slides: sections.length };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const result = await validate(); console.log(`PASS: ${result.slides} slides, 1600×900 print CSS, local assets, no remote dependencies or secret-like keys, valid JavaScript.`); }
  catch (error) { console.error(`Validation failed:\n${error.message}`); process.exitCode = 1; }
}
