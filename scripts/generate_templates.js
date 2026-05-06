#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');

async function isDir(p) {
  try {
    const st = await fs.stat(p);
    return st.isDirectory();
  } catch (e) {
    return false;
  }
}

async function main() {
  const root = path.join(__dirname, '..');
  const assetsDir = path.join(root, 'assets');
  const outFile = path.join(assetsDir, 'templates.json');

  const entries = await fs.readdir(root, { withFileTypes: true });
  const out = {};

  const exclude = new Set(['assets', '.git', 'node_modules', '.github']);

  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const name = ent.name;
    if (exclude.has(name)) continue;

    const dirPath = path.join(root, name);
    if (!(await isDir(dirPath))) continue;

    const files = await fs.readdir(dirPath);
    const htmlFiles = files.filter(f => f.toLowerCase().endsWith('.html'));
    if (htmlFiles.length) {
      htmlFiles.sort((a,b)=>a.localeCompare(b, 'en', {sensitivity:'base'}));
      out[name] = htmlFiles;
    }
  }

  // ensure assets dir exists
  try { await fs.mkdir(assetsDir, { recursive: true }); } catch (e) {}

  const pretty = JSON.stringify(out, null, 2) + '\n';
  await fs.writeFile(outFile, pretty, 'utf8');
  console.log('Wrote', outFile);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
