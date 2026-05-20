# SATEX Release Procedure

Operational runbook for cutting a signed Windows release. Captures the structure
of the institutional release directive (2026-05-19) with verified-against-repo
facts substituted for the directive's guesses.

Designed to survive `/clear` — a fresh session reading this + `CLAUDE.md` +
the memory index should be able to execute end-to-end without re-deriving
anything.

---

## Prerequisites (must all be TRUE before starting)

- [ ] **HEAD on `master`** at the code-complete commit (today: `fa68c55` for v0.4.4)
- [ ] **CI green** for that commit (`gh run list --branch master --limit 1`)
- [ ] **Health stack locally green**: typecheck 0 / lint 0 / vitest 222+/222+ / knip 0
- [ ] **Authenticode cert on disk** as a `.pfx` somewhere outside the repo
  - Verify with `certutil -dump <path>.pfx` (will prompt for password)
  - Subject CN MUST match `SATEX Trading Systems` (the CN in `certs/satex-codesign.csr`)
- [ ] **`CSC_LINK`** env var set to the absolute path of the `.pfx`
- [ ] **`CSC_KEY_PASSWORD`** env var set to the `.pfx` password
  - Verify with `echo %CSC_LINK%` and confirm the file exists; check `%CSC_KEY_PASSWORD%` is non-empty (but don't echo it)
- [ ] **`gh` CLI authenticated** (`gh auth status`)
- [ ] **CHANGELOG.md placeholder swapped** — change `## 0.4.4 (2026-05-XX)` to the actual tag date (commit this BEFORE tagging so the tag points at a CHANGELOG that names itself correctly)

If ANY prerequisite is missing, halt. Don't proceed with a half-met checklist.

---

## Mandate 1 · Pre-flight integrity

```powershell
# Working directory: 00-PROJECT-ROOT/01-SATEX-CORE/satex-app

# 1. Confirm HEAD
git rev-parse HEAD
# expect: fa68c55... or the new commit that swapped the CHANGELOG date

# 2. Working tree status
git status --porcelain
# expect: empty (or, at most, the deferred .gitignore mods that the
# project_next_session.md invariants explicitly forbid committing)

# 3. Full health stack
npm run typecheck && npm run lint && npm test && npm run knip
# expect: all four exit 0
```

**Fail-fast**: any of the four health gates failing → abort. Don't proceed.

---

## Mandate 2 · Build & sign

The build script is `npm run pack:win` which expands to:
`npm run prepack:check && npm run build && electron-builder --win --x64 --publish never`

`electron-builder` auto-picks up `CSC_LINK` + `CSC_KEY_PASSWORD` from the
environment — no YAML edits required. `signtoolOptions.signingHashAlgorithms`
is already pinned to `sha256` in `electron-builder.yml`.

```powershell
# Working directory: 00-PROJECT-ROOT/01-SATEX-CORE/satex-app

# Confirm env vars are visible (file existence + password length only, don't echo password)
test -f "$env:CSC_LINK"
# expect: file exists; if not, ABORT — your env vars are pointed at the wrong path

# Build
npm run pack:win
# expect (success path):
#   - prepack:check passes (no version-string drift)
#   - electron-vite build emits to out/
#   - electron-builder packages to dist/SATEX Setup 0.4.4.exe
#   - signtool lines in the log showing the cert was applied
```

### Artifact verification

```powershell
# The output path is dist/ (electron-builder convention; NOT out/make/ — that's Electron Forge)
cd dist
ls "SATEX Setup 0.4.4.exe"
# expect: file exists, ~60–110 MB

# Verify the signature
signtool verify /pa /v "SATEX Setup 0.4.4.exe"
# expect: "Successfully verified" with the CA chain printed
# expect: Subject CN = "SATEX Trading Systems"
# expect: SHA256 sign timestamp present (RFC 3161 — survives cert expiry)
```

**Fail-fast**: signtool says "not signed" or "invalid signature" → CRITICAL.
Don't proceed; investigate cert installation, CSC env vars, or signing
provider connectivity.

---

## Mandate 3 · Checksum + distribution

```powershell
# Working directory: 00-PROJECT-ROOT/01-SATEX-CORE/satex-app/dist

# Generate SHA-256 checksum
$installer = "SATEX Setup 0.4.4.exe"
$hash = (certutil -hashfile $installer SHA256 | Select-Object -Index 1).Trim()
$size = (Get-Item $installer).Length

# Write a human-readable checksums file
@"
File:    $installer
Size:    $size bytes
SHA-256: $hash
"@ | Out-File -Encoding utf8 "SATEX-0.4.4-checksums.txt"

# Sanity-check the file
cat "SATEX-0.4.4-checksums.txt"
```

GitHub Releases is the artifact home (not S3 — SATEX has no separate object
store today). Upload happens in Mandate 4's `gh release create`.

---

## Mandate 4 · Tag + publish

### Tag (annotated, NOT GPG-signed by default)

Current git config has no GPG signing key (`user.signingkey` unset). The
release directive's `git tag -s` would fail with "secret key not available".

Two options:

**Option A — Annotated tag (default).** The Authenticode signature on the
`.exe` is what end-users verify; the git tag conveys authorship via commit
metadata. Adequate for SATEX's distribution model.

```powershell
git tag -a v0.4.4 -m "Release v0.4.4: Sub-second crypto candles + per-symbol bucket pref + SUB legend badge + auto-update toast. See CHANGELOG.md."
git push origin v0.4.4
```

**Option B — GPG-signed tag.** Only if you've previously generated a GPG key
and set `user.signingkey`. Steps:

```powershell
# One-time setup (do NOT do this during the release run — do it ahead of time)
gpg --gen-key
$keyId = (gpg --list-secret-keys --keyid-format LONG | Select-String "sec   ").ToString().Split('/')[1].Split(' ')[0]
git config user.signingkey $keyId
# Optional: git config tag.gpgsign true  (auto-sign all future tags)

# Then the release tag
git tag -s v0.4.4 -m "Release v0.4.4"
git push origin v0.4.4
```

### Verify the tag landed on origin

```powershell
git ls-remote origin refs/tags/v0.4.4
# expect: <commit-hash> refs/tags/v0.4.4
# the <commit-hash> MUST match HEAD
```

### Publish the GitHub Release

```powershell
# Working directory: any (gh uses repo from cwd if it's a git checkout, but the
# files are referenced by absolute path so cwd only affects --repo discovery)
cd "C:/Users/User/mc4/00-PROJECT-ROOT/01-SATEX-CORE/satex-app"

# Extract the v0.4.4 section from CHANGELOG to use as release notes body
# (manual paste is fine if you prefer)
gh release create v0.4.4 `
  "dist/SATEX Setup 0.4.4.exe" `
  "dist/SATEX-0.4.4-checksums.txt" `
  --title "v0.4.4 — Sub-second crypto candles" `
  --notes-file <(awk '/^## 0.4.4/,/^## 0.4.3/' CHANGELOG.md | head -n -1) `
  --verify-tag
```

The `--verify-tag` flag refuses to publish if the tag doesn't exist remotely —
defense-in-depth against a half-applied push.

---

## Mandate 5 · Smoke + post-deploy

1. **Run the smoke test**: `docs/release-checklists/v0.4.4-smoke-test.md`
   - All 45–60 min of it. Every checkbox.
   - Any rollback-trigger row firing → execute Rollback (below) immediately.
2. **Close issue #2** with a comment linking the GH Release:
   `gh issue close 2 --comment "Resolved by v0.4.4 — signed installer published at <release-url>"`
3. **Update CLAUDE.md**:
   - Append `**Released:** <YYYY-MM-DD>` to the v0.4.4 section
   - Add the GH Release URL
   - Remove S1-8 from the "Known blocker" line
4. **Memory hygiene** — update `project_next_session.md` to:
   - Note v0.4.4 shipped on `<date>`
   - Promote A1 Sprint 3 to the top-of-mind item
   - Add the v0.4.4 release URL to the changelog of shipped versions

---

## Rollback (any smoke-test rollback trigger fires)

```powershell
# 1. Hide the GH Release — keeps the tag but unpublishes the binary
gh release edit v0.4.4 --draft

# 2. If the issue is in the code state, delete the tag
git tag -d v0.4.4
git push origin :refs/tags/v0.4.4

# 3. Pin a notice on the (now-draft) release describing what failed
gh release edit v0.4.4 --notes "⚠️ v0.4.4 yanked due to <specific issue>. Stay on v0.4.3 until v0.4.5 is published."

# 4. File a P0 issue referencing the failing checklist row
gh issue create --title "P0: v0.4.4 yanked — <one-line root cause>" --body "See <smoke-test-row-link>. Stay on v0.4.3 until fix lands."

# 5. Manual outreach to any analyst already running v0.4.4
#    (no auto-channel until Sprint 3 wires telemetry)
```

**Auto-update blast radius**: v0.4.4 ships with `autoDownload: false` and
`autoInstallOnAppQuit: false` — every install is consent-gated via the toast.
Worst case is a small population of consenting users who accepted the toast.
Reach them via the channel they're in (Slack, email, whatever the org uses).

---

## Known gotchas

- **`out/make/win/x64/`** — the release directive references this path, which
  is Electron Forge's output convention. SATEX uses **electron-builder**, which
  outputs to **`dist/`**. Don't go looking in `out/make/` — you won't find the
  installer there.
- **"Satex Trading Inc."** — the release directive guesses this as the cert
  subject. The CSR (`certs/satex-codesign.csr`) actually has CN =
  **`SATEX Trading Systems`**. Verify against the CSR, not the directive.
- **`requestedExecutionLevel: asInvoker`** is intentional (S0-6 audit
  decision). Don't change to `requireAdministrator` or `highestAvailable`
  during signing — they're unrelated to Authenticode and would force UAC
  prompts users shouldn't see.
- **Working tree never strictly clean** — `.gitignore` mods at root +
  `01-SATEX-CORE/` are perpetually flagged as modified per the v0.4.3
  post-release tidy invariant. They're intentionally uncommitted; tolerate
  them. Untracked vault dirs (Vault/, docs/, references/, Logo/) are the
  user's local-only working state; also tolerated.

---

## Related files

- `CHANGELOG.md` — `## 0.4.4` section is the canonical release notes source
- `CLAUDE.md` — `v0.4.4 — Sub-second crypto candles` section
- `electron-builder.yml` — packaging + signing config
- `scripts/prepack-check.js` — pre-build drift guard
- `certs/HANDOFF.md` — CA workflow (cert procurement)
- `certs/satex-codesign.csr` — CSR (CN = `SATEX Trading Systems`)
- `docs/design/A1-subsecond-candles.md` — feature design doc
- `docs/release-checklists/v0.4.4-smoke-test.md` — post-release verification
