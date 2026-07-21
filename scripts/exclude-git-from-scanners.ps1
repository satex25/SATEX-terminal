#requires -Version 5
<#
.SYNOPSIS
  ONE-TIME durable fix for recurring stale .git\*.lock files on Windows.
  Excludes the SATEX repo from Windows Defender real-time scanning and the
  Windows Search indexer — the two processes that hold .git\*.lock handles
  mid-write and cause git's unlink() to fail (EPERM), leaving the lock behind.

.DESCRIPTION
  MUST be run in an ELEVATED PowerShell (Run as administrator) — Defender
  exclusions require admin. It:
    1. adds the repo root + .git to Defender's ExclusionPath;
    2. adds git.exe to Defender's ExclusionProcess;
    3. marks .git "not content indexed" so the Windows Search indexer skips it.

  Idempotent: re-running is harmless (Add-MpPreference de-dupes).

.EXAMPLE
  # Right-click PowerShell -> Run as administrator, then:
  powershell -ExecutionPolicy Bypass -File scripts\exclude-git-from-scanners.ps1

.NOTES
  After this runs once, git can always delete its own lock files, so stale
  locks stop being CREATED. scripts\git-unlock.sh (wired as a Claude Code hook)
  remains the recovery net for anything a killed git command still leaves.
#>
param([string]$RepoRoot = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = 'Stop'

# --- elevation gate -------------------------------------------------------
$isAdmin = ([Security.Principal.WindowsPrincipal]`
  [Security.Principal.WindowsIdentity]::GetCurrent()`
  ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Error "This must run in an ELEVATED PowerShell (Run as administrator). Defender exclusions require admin."
  exit 1
}

$RepoRoot = (Resolve-Path $RepoRoot).Path
$GitDir   = Join-Path $RepoRoot ".git"
Write-Host "Repo: $RepoRoot" -ForegroundColor Cyan

# --- 1 + 2: Windows Defender exclusions -----------------------------------
try {
  Add-MpPreference -ExclusionPath $RepoRoot -ErrorAction Stop
  Add-MpPreference -ExclusionPath $GitDir  -ErrorAction Stop
  Add-MpPreference -ExclusionProcess "git.exe" -ErrorAction Stop
  Write-Host "Defender: excluded repo, .git, and git.exe." -ForegroundColor Green
} catch {
  Write-Warning "Defender exclusion failed: $($_.Exception.Message)"
}

# --- 3: Windows Search indexer — mark .git not-content-indexed -------------
if (Test-Path $GitDir) {
  try {
    # +I sets FILE_ATTRIBUTE_NOT_CONTENT_INDEXED on .git and everything under it.
    & attrib.exe +I "$GitDir" /S /D | Out-Null
    Write-Host "Search indexer: .git marked not-content-indexed." -ForegroundColor Green
  } catch {
    Write-Warning "Could not set not-content-indexed on .git: $($_.Exception.Message)"
  }
}

# --- verify ---------------------------------------------------------------
Write-Host "`nCurrent Defender ExclusionPath entries:" -ForegroundColor Cyan
(Get-MpPreference).ExclusionPath | Where-Object { $_ -like "*$([System.IO.Path]::GetFileName($RepoRoot))*" }
Write-Host "`nDone. Stale .git locks should stop being created. Re-run anytime; it is idempotent." -ForegroundColor Green
