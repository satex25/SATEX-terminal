# ============================================================
# SATEX — Root Noise Removal (§3.1 of repo-structure-cleanup)
# Generated: 2026-06-16 | Run from repo root (mc4/)
# ============================================================
# Pre-requisite: git index must be healthy.
# Run first: git status (to confirm no "index file corrupt")
# If corrupt: Remove-Item .git\index; git reset
# ============================================================
# STEP 0: Safety confirmation
# ============================================================
Set-Location $PSScriptRoot\..   # repo root
Write-Host "=== Repo root: $(Get-Location) ===" -ForegroundColor Cyan
$branch = git branch --show-current
Write-Host "=== Branch: $branch ===" -ForegroundColor Cyan
if ($branch -ne "master") {
    Write-Warning "Not on master — are you sure? (Ctrl+C to abort)"
    Start-Sleep -Seconds 5
}

# ============================================================
# STEP 1: Remove untracked transient git bundles
# ============================================================
Write-Host "`n[1] Removing git bundles..." -ForegroundColor Yellow
$bundles = @("d2-rebase-input.bundle", "d2-rebased.bundle", "l1d-rebased.bundle")
foreach ($f in $bundles) {
    if (Test-Path $f) { Remove-Item $f -Force; Write-Host "  DEL $f" }
}

# ============================================================
# STEP 2: Remove untracked one-shot bat scripts
# ============================================================
Write-Host "`n[2] Removing one-shot batch files..." -ForegroundColor Yellow
$bats = @("CLEANUP-STALE-FILES.bat", "FETCH-D2-FOR-REBASE.bat",
          "PUSH-D2-TO-GITHUB.bat", "PUSH-L1D-TO-GITHUB.bat")
foreach ($f in $bats) {
    if (Test-Path $f) { Remove-Item $f -Force; Write-Host "  DEL $f" }
}

# ============================================================
# STEP 3: Remove stale PR body files
# ============================================================
Write-Host "`n[3] Removing stale PR body files..." -ForegroundColor Yellow
$prBodies = @(".pr-body-audit-psd.md", ".pr-body-l1d-funded-compliance.md")
foreach ($f in $prBodies) {
    if (Test-Path $f) { Remove-Item $f -Force; Write-Host "  DEL $f" }
}

# ============================================================
# STEP 4: Remove garbage paste-files
# ============================================================
Write-Host "`n[4] Removing garbage text files..." -ForegroundColor Yellow
$garbage = @(
    "Should show 0 errors. If rolldown b.txt",
    "UX Task Flow Design Prompt Role You.txt"
)
foreach ($f in $garbage) {
    if (Test-Path $f) { Remove-Item $f -Force; Write-Host "  DEL $f" }
}

# ============================================================
# STEP 5: Remove root-level duplicate policy docs
# (canonical copies live in docs/policy/ — verified identical when normalized)
# ============================================================
Write-Host "`n[5] Removing root duplicate policy docs..." -ForegroundColor Yellow
$dupes = @("rule-VS.md", "SATEX-CLAUDE-DESIGN-PROMPT.md")
foreach ($f in $dupes) {
    if (Test-Path $f) {
        # These are untracked duplicates of docs/policy/ — safe to Remove-Item
        Remove-Item $f -Force
        Write-Host "  DEL $f  (canonical in docs/policy/)"
    }
}

# ============================================================
# STEP 6: Move HOME.md → Vault/HOME.md (Obsidian cockpit)
# ============================================================
Write-Host "`n[6] Moving HOME.md to Vault/HOME.md..." -ForegroundColor Yellow
if (Test-Path "HOME.md") {
    if (-not (Test-Path "Vault")) { New-Item -ItemType Directory -Path "Vault" | Out-Null }
    Move-Item "HOME.md" "Vault\HOME.md" -Force
    Write-Host "  MOVED HOME.md -> Vault/HOME.md"
}

# ============================================================
# STEP 7: Remove chrome-devtools-mcp residue (root package.json / node_modules)
# Verify it IS the MCP residue before deleting
# ============================================================
Write-Host "`n[7] Checking root package.json (chrome-devtools-mcp residue)..." -ForegroundColor Yellow
if (Test-Path "package.json") {
    $pkg = Get-Content "package.json" -Raw
    if ($pkg -match "chrome-devtools-mcp") {
        Remove-Item "package.json" -Force
        Write-Host "  DEL package.json  (chrome-devtools-mcp residue)"
        if (Test-Path "package-lock.json") {
            Remove-Item "package-lock.json" -Force
            Write-Host "  DEL package-lock.json"
        }
        if (Test-Path "node_modules") {
            Remove-Item "node_modules" -Recurse -Force
            Write-Host "  DEL node_modules/"
        }
    } else {
        Write-Warning "  package.json does NOT match chrome-devtools-mcp — skipping (manual review needed)"
    }
}

# ============================================================
# STEP 8: git status after cleanup (confirm clean root)
# ============================================================
Write-Host "`n[8] Post-cleanup git status (core.autocrlf=true):" -ForegroundColor Cyan
git -c core.autocrlf=true status --short

Write-Host "`n=== Root noise removal complete. ===" -ForegroundColor Green
Write-Host "Durable root entries remaining: README.md, AGENTS.md, ARCHITECTURE.md,"
Write-Host "  .github/, .husky/, .gitignore, .gitattributes, .claude/, .obsidian/,"
Write-Host "  00-PROJECT-ROOT/, Vault/, docs/, 90-REFERENCE/"
