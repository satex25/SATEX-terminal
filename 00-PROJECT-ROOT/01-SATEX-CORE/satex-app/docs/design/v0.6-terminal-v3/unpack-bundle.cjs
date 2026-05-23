// One-shot extractor for the Claude Design standalone HTML bundle.
// Reads the manifest + template script tags, base64-decodes each asset,
// gunzips when compressed, and writes the result to ./unpacked/.
//
// Run: node unpack-bundle.cjs "SATEX Terminal v3 _standalone_.html" ./unpacked

'use strict';
const fs   = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const [, , htmlPath, outDir] = process.argv;
if (!htmlPath || !outDir) {
  console.error('usage: node unpack-bundle.cjs <html> <outdir>');
  process.exit(2);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const manifestMatch = html.match(/<script type="__bundler\/manifest">([\s\S]*?)<\/script>/);
const templateMatch = html.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/);
if (!manifestMatch || !templateMatch) {
  console.error('manifest or template script tag not found');
  process.exit(1);
}
const manifest = JSON.parse(manifestMatch[1]);
const template = JSON.parse(templateMatch[1]);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, '_template.json'), JSON.stringify(template, null, 2));

const summary = [];
let n = 0;
for (const uuid of Object.keys(manifest)) {
  const entry = manifest[uuid];
  const raw = Buffer.from(entry.data, 'base64');
  const bytes = entry.compressed ? zlib.gunzipSync(raw) : raw;

  const safeName = (entry.name || uuid).replace(/[<>:"/\\|?*]/g, '_').slice(0, 80);
  const ext = entry.mime ? (entry.mime.split('/')[1] || 'bin').split(';')[0] : 'bin';
  const fileName = `${String(n).padStart(4, '0')}_${safeName}${safeName.includes('.') ? '' : '.' + ext}`;

  fs.writeFileSync(path.join(outDir, fileName), bytes);

  summary.push({
    uuid,
    name: entry.name || null,
    mime: entry.mime || null,
    compressed: !!entry.compressed,
    rawBytes:   raw.length,
    finalBytes: bytes.length,
    out: fileName,
  });
  n++;
}

fs.writeFileSync(path.join(outDir, '_manifest_summary.json'), JSON.stringify(summary, null, 2));
console.log(`Unpacked ${summary.length} assets → ${outDir}`);

// Print a quick text summary
for (const s of summary) {
  console.log(`  ${s.out.padEnd(50)} ${s.mime || '?'.padEnd(20)} ${s.finalBytes} B`);
}
