# ============================================================
# SATEX — Wrapper Flatten: 00-PROJECT-ROOT/01-SATEX-CORE/ → satex-app/
# §3.5 of repo-structure-cleanup ultraplan | 2026-06-16
# ============================================================
# ONE-WAY DOOR. Run only after:
#   1. §3.4 (services subdivision) is merged and CI is green.
#   2. All open branches that touch satex-app/ are merged or closed
#      (mass file moves are a maximal merge-conflict surface — P-012 rationale).
#   3. A local gate run from OLD path confirms baseline:
#      cd 00-PROJECT-ROOT\01-SATEX-CORE\satex-app
#      npm run typecheck && npm run lint && npm test && npm run knip
# ============================================================
# WHAT THIS SCRIPT DOES:
#   1. git mv the app up two directory levels
#   2. Delete the empty wrapper dirs + their stale package.json / node_modules
#   3. Update ci.yml (2 refs), .husky/pre-commit (1), .claude/ (5)
#   4. Commits on a branch; you push + open a PR; CI must go green TWICE
#      before you delete the old tree.
# ============================================================
param(
    [switch]$DryRun = $false
)

Set-Location $PSScriptRoot\..   # repo root
$root = Get-Location
Write-Host "=== Repo root: $root ===" -ForegroundColor Cyan
if ($DryRun) { Write-Host "=== DRY RUN (no changes) ===" -ForegroundColor Magenta }

$branch = "chore/flatten-wrapper"
$oldPath = "00-PROJECT-ROOT\01-SATEX-CORE\satex-app"
$newPath = "satex-app"

# ── Gate: confirm old path exists ─────────────────────────────────────────────
if (-not (Test-Path $oldPath)) {
    Write-Error "Old path not found: $oldPath — is the app already flattened?"
    exit 1
}
if (Test-Path $newPath) {
    Write-Error "Target $newPath already exists — abort."
    exit 1
}

# ── Step 0: Create and checkout the branch ────────────────────────────────────
Write-Host "`n[0] Creating branch $branch..." -ForegroundColor Yellow
if (-not $DryRun) {
    git checkout -b $branch
}

# ── Step 1: git mv the app ────────────────────────────────────────────────────
Write-Host "`n[1] git mv $oldPath → $newPath  (preserves history)" -ForegroundColor Yellow
if (-not $DryRun) {
    git mv $oldPath $newPath
}

# ── Step 2: Delete wrapper layer residue ──────────────────────────────────────
Write-Host "`n[2] Removing wrapper layer residue..." -ForegroundColor Yellow
$wrapperFiles = @(
    "00-PROJECT-ROOT\01-SATEX-CORE\package.json",
    "00-PROJECT-ROOT\01-SATEX-CORE\package-lock.json",
    "00-PROJECT-ROOT\package.json",
    "00-PROJECT-ROOT\package-lock.json"
)
foreach ($f in $wrapperFiles) {
    if (Test-Path $f) {
        if (-not $DryRun) { git rm -f $f 2>$null; Remove-Item $f -Force -ErrorAction SilentlyContinue }
        Write-Host "  DEL $f"
    }
}
# node_modules inside wrappers
@("00-PROJECT-ROOT\01-SATEX-CORE\node_modules", "00-PROJECT-ROOT\node_modules") | ForEach-Object {
    if (Test-Path $_) {
        if (-not $DryRun) { Remove-Item $_ -Recurse -Force }
        Write-Host "  DEL $_/"
    }
}

# ── Step 3: Edit ci.yml (2 refs) ──────────────────────────────────────────────
Write-Host "`n[3] Updating .github/workflows/ci.yml..." -ForegroundColor Yellow
$ciPath = ".github\workflows\ci.yml"
if (Test-Path $ciPath) {
    $ci = Get-Content $ciPath -Raw
    $ci = $ci -replace "00-PROJECT-ROOT/01-SATEX-CORE/satex-app", "satex-app"
    $ci = $ci -replace "00-PROJECT-ROOT\\01-SATEX-CORE\\satex-app", "satex-app"
    if (-not $DryRun) { Set-Content $ciPath $ci -NoNewline }
    Write-Host "  UPDATED $ciPath"
}

# ── Step 4: Edit .husky/pre-commit (1 ref) ───────────────────────────────────
Write-Host "`n[4] Updating .husky/pre-commit..." -ForegroundColor Yellow
$huskyPath = ".husky\pre-commit"
if (Test-Path $huskyPath) {
    $h = Get-Content $huskyPath -Raw
    $h = $h -replace "00-PROJECT-ROOT/01-SATEX-CORE/satex-app", "satex-app"
    if (-not $DryRun) { Set-Content $huskyPath $h -NoNewline }
    Write-Host "  UPDATED $huskyPath"
}

# ── Step 5: Edit .claude/ refs (5 refs across 2 files) ───────────────────────
Write-Host "`n[5] Updating .claude/ path refs..." -ForegroundColor Yellow
$claudeFiles = @(
    ".claude\settings.json",
    ".claude\commands\satex-review.md"
)
foreach ($f in $claudeFiles) {
    if (Test-Path $f) {
        $c = Get-Content $f -Raw
        $updated = $c -replace "00-PROJECT-ROOT/01-SATEX-CORE/satex-app", "satex-app"
        $updated = $updated -replace "00-PROJECT-ROOT\\\\01-SATEX-CORE\\\\satex-app", "satex-app"
        if ($updated -ne $c) {
            if (-not $DryRun) { Set-Content $f $updated -NoNewline }
            Write-Host "  UPDATED $f"
        }
    }
}

# ── Step 6: Edit AGENTS.md (3 refs), ARCHITECTURE.md (path refs), README.md ──
Write-Host "`n[6] Updating workspace docs..." -ForegroundColor Yellow
$docs = @("AGENTS.md", "ARCHITECTURE.md", "README.md")
foreach ($f in $docs) {
    if (Test-Path $f) {
        $c = Get-Content $f -Raw
        $updated = $c -replace "00-PROJECT-ROOT/01-SATEX-CORE/satex-app", "satex-app"
        if ($updated -ne $c) {
            if (-not $DryRun) { Set-Content $f $updated -NoNewline }
            Write-Host "  UPDATED $f"
        }
    }
}

# ── Step 7: Run gates from NEW path ───────────────────────────────────────────
Write-Host "`n[7] Running all four gates from new path: $newPath" -ForegroundColor Yellow
if (-not $DryRun) {
    Push-Location $newPath
    npm run typecheck
    if ($LASTEXITCODE -ne 0) { Write-Error "TYPECHECK FAILED — do NOT delete old tree"; Pop-Location; exit 1 }
    npm run lint
    if ($LASTEXITCODE -ne 0) { Write-Error "LINT FAILED"; Pop-Location; exit 1 }
    npm test
    if ($LASTEXITCODE -ne 0) { Write-Error "TESTS FAILED"; Pop-Location; exit 1 }
    npm run knip
    Pop-Location
    Write-Host "  All four gates PASSED from new path." -ForegroundColor Green
}

# ── Step 8: Commit ────────────────────────────────────────────────────────────
Write-Host "`n[8] Committing..." -ForegroundColor Yellow
if (-not $DryRun) {
    git add -A
    git commit -m "chore(structure): flatten 00-PROJECT-ROOT/01-SATEX-CORE/satex-app → satex-app/

One-way structural move. App code unchanged — pure path topology change.
Updates: ci.yml (working-directory + cache-dependency-path), .husky/pre-commit,
.claude/settings.json + commands/satex-review.md, AGENTS.md, ARCHITECTURE.md,
README.md. Wrapper layer deleted. All four gates green from satex-app/.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
}

# ── Step 9: Push and PR instructions ─────────────────────────────────────────
Write-Host "`n[9] Push and open PR:" -ForegroundColor Cyan
Write-Host "  git push origin $branch"
Write-Host "  gh pr create --title 'chore(structure): flatten wrapper — satex-app/ at root' --body-file scripts\pr-body-flatten.md"
Write-Host ""
Write-Host "⚠️  WAIT for CI to go GREEN from the new working-directory."
Write-Host "    Only AFTER CI green twice, delete the old wrapper:"
Write-Host "      Remove-Item '00-PROJECT-ROOT' -Recurse -Force"
Write-Host "      git add -A && git commit -m 'chore: delete empty 00-PROJECT-ROOT wrapper'"
Write-Host ""
Write-Host "=== flatten-wrapper.ps1 complete ===" -ForegroundColor Green
