/**
 * SATEX — prepack:check (2026-05-18)
 *
 * Asserts that src/main/index.ts contains NO hardcoded version literal. The
 * snapshot-export block at main/index.ts used to ship a string like
 *   app: { name: 'satex', version: '0.3.0' }
 * which drifted three releases behind package.json before anyone noticed.
 * Fix 6 replaced that with `version: app.getVersion()`, which reads from the
 * packaged package.json at runtime — zero drift surface.
 *
 * This check prevents regression: if any future edit reintroduces a literal
 * version string in src/main/index.ts, pack:win refuses to run.
 *
 * Wired via package.json scripts:
 *   "prepack:check": "node scripts/prepack-check.js"
 *   "pack:win":      "npm run prepack:check && npm run build && electron-builder ..."
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'main', 'index.ts');
const src = fs.readFileSync(SRC, 'utf8');

// Look for any `version: '<x.y.z>'` literal (single or double quoted). The
// regex must NOT match `version: app.getVersion()` or `version: pkg.version`.
const m = src.match(/version\s*:\s*['"]([0-9]+\.[0-9]+\.[0-9]+[A-Za-z0-9.+-]*)['"]/);
if (m) {
  console.error(
    `\n[prepack:check] VERSION DRIFT — src/main/index.ts contains hardcoded version literal '${m[1]}'.\n` +
    `Use \`app.getVersion()\` instead; the value is read from the packaged package.json at runtime.\n` +
    `See Fix 6 in CHANGELOG 0.4.2 for context.\n`
  );
  process.exit(1);
}

console.log('[prepack:check] OK — no hardcoded version drift surface in src/main/index.ts');

// S1-8 (2026-05-19) — surface the signing-env-var state. Doesn't block the
// build (unsigned builds are still useful for dev / smoke testing); just
// reminds the operator what's about to happen.
if (process.env.CSC_LINK && process.env.CSC_KEY_PASSWORD) {
  const masked = process.env.CSC_LINK.length > 40
    ? process.env.CSC_LINK.slice(0, 20) + '…(base64 or URL)…'
    : process.env.CSC_LINK;
  console.log(`[prepack:check] CSC_LINK set (${masked}) + CSC_KEY_PASSWORD set → installer WILL BE SIGNED`);
} else {
  console.warn('[prepack:check] CSC_LINK / CSC_KEY_PASSWORD unset → installer WILL BE UNSIGNED.');
  console.warn('[prepack:check] See certs/HANDOFF.md for the cert procurement workflow.');
}

