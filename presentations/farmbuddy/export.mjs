#!/usr/bin/env node
// No npm packages, downloads, web servers, or uploads are needed.
import { access, mkdtemp, readFile, readdir, rm, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir, tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { validate } from './validate.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
async function executable(path) {
  try { await access(path, constants.X_OK); return true; } catch { return false; }
}
async function discover() {
  if (process.env.CHROMIUM_PATH) {
    const path = resolve(process.env.CHROMIUM_PATH);
    if (await executable(path)) return path;
    throw new Error(`CHROMIUM_PATH is not executable: ${path}`);
  }
  const cache = join(homedir(), '.cache', 'ms-playwright');
  const dirs = ['chromium-1248', 'headless_shell-1248', 'chromium_headless_shell-1248'];
  async function search(dir, depth = 0) {
    if (depth > 3) return null;
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return null; }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isFile() && ['chrome', 'chromium', 'headless_shell', 'chrome-headless-shell'].includes(entry.name) && await executable(path)) return path;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) { const found = await search(join(dir, entry.name), depth + 1); if (found) return found; }
    }
    return null;
  }
  for (const dir of dirs) { const found = await search(join(cache, dir)); if (found) return found; }
  throw new Error(`No existing Chromium executable found under ${cache}/{chromium-1248,headless_shell-1248,chromium_headless_shell-1248}. Set CHROMIUM_PATH to an existing local executable. Nothing was installed.`);
}
function run(binary, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let timedOut = false;
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-16000); });
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 90000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolveRun();
      else reject(new Error(`Chromium ${timedOut ? 'timed out after 90 seconds' : `exited ${code ?? signal}`}\n${stderr}`));
    });
  });
}
async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node presentations/farmbuddy/export.mjs [output.pdf] [--force]\nDefaults to presentations/farmbuddy/FarmBuddy-Product-Overview.pdf. Set CHROMIUM_PATH to use an existing local browser. Existing PDFs are not replaced without --force.');
    return;
  }
  const positional = args.filter(arg => arg !== '--force');
  if (positional.length > 1 || positional.some(arg => arg.startsWith('--'))) throw new Error('Unknown arguments. Use --help for usage.');
  await validate();
  const binary = await discover();
  const output = positional[0] ? resolve(positional[0]) : join(root, 'FarmBuddy-Product-Overview.pdf');
  if (!output.toLowerCase().endsWith('.pdf')) throw new Error('Output path must end in .pdf.');
  let exists = false;
  try { await access(output); exists = true; } catch {}
  if (exists && !args.includes('--force')) throw new Error(`Output already exists: ${output}. Choose another path or pass --force.`);
  await mkdir(dirname(output), { recursive: true });
  const profile = await mkdtemp(join(process.env.JCODE_SCRATCH_DIR || tmpdir(), 'farmbuddy-chromium-'));
  try {
    const flags = ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-background-networking', '--host-resolver-rules=MAP * ~NOTFOUND', '--disable-extensions', '--disable-component-update', '--disable-sync', '--no-first-run', '--no-default-browser-check', '--allow-file-access-from-files', '--no-pdf-header-footer', '--run-all-compositor-stages-before-draw', '--virtual-time-budget=2000', '--window-size=1600,900', `--user-data-dir=${profile}`, `--print-to-pdf=${output}`, pathToFileURL(join(root, 'index.html')).href];
    console.log(`Export command:\n${[binary, ...flags].map(quote).join(' ')}`);
    await run(binary, flags);
    const pdf = await readFile(output);
    if (pdf.subarray(0, 5).toString() !== '%PDF-' || pdf.length < 1000) throw new Error('Chromium did not produce a valid nonempty PDF.');
    const pageCount = [...pdf.toString('latin1').matchAll(/\/Type\s*\/Page\b/g)].length;
    if (pageCount !== 10) throw new Error(`Expected ten physical PDF pages, received ${pageCount}. Inspect print layout before sharing.`);
    console.log(`Exported ${output} (${pdf.length.toLocaleString()} bytes, ${pageCount} pages). Print layout comes from deck.css.`);
  } finally { await rm(profile, { recursive: true, force: true }); }
}
main().catch(error => { console.error(`Export failed: ${error.message}`); process.exitCode = 1; });
