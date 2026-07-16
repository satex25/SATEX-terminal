#requires -Version 5
<#
.SYNOPSIS
  Remove stale git lock files (index.lock, packed-refs.lock, HEAD.lock,
  config.lock, refs/**/*.lock) that a crashed git op or an antivirus / search
  indexer scan left behind.

.DESCRIPTION
  Safe by construction: it refuses to run while a git.exe process is active, so
  it can never remove a *live* lock. Clears any read-only attribute before
  deleting. Prints exactly what it removed.

  Root cause on this machine (verified 2026-07-13): Windows Defender (MsMpEng)
  and the Windows Search indexer scan .git files mid-write, which produces the
  EPERM-on-unlink you keep hitting. The durable fix is to exclude the repo from
  both (see scripts/README-git-locks.md). This script is the recovery net for
  when a lock still slips through.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\git-unlock.ps1
  # run from the repo root, or:
  powershell -ExecutionPolicy Bypass -File scripts\git-unlock.ps1 -RepoRoot C:\Users\User\mc4
#>
param([string]$RepoRoot = (Get-Location).Path)

$gitDir = Join-Path $RepoRoot ".git"
if (-not (Test-Path $gitDir)) { Write-Error "No .git directory at $RepoRoot"; exit 1 }

# Safety gate: never remove a lock while git is actually running.
$live = Get-Process git -ErrorAction SilentlyContinue
if ($live) {
  Write-Warning ("git.exe is running (PID {0}). A lock here may be LIVE, not stale. Aborting so we don't corrupt an in-flight op." -f ($live.Id -join ', '))
  exit 2
}

$fixed = @(
  (Join-Path $gitDir "index.lock"),
  (Join-Path $gitDir "packed-refs.lock"),
  (Join-Path $gitDir "HEAD.lock"),
  (Join-Path $gitDir "config.lock")
)
$refLocks = Get-ChildItem -Path (Join-Path $gitDir "refs") -Recurse -Filter "*.lock" -ErrorAction SilentlyContinue |
            ForEach-Object { $_.FullName }
$all = @($fixed + $refLocks) | Where-Object { $_ -and (Test-Path $_) }

if (-not $all) { Write-Host "No stale locks. Repo is clean." -ForegroundColor Green; exit 0 }

$failed = @()
foreach ($f in $all) {
  try {
    Set-ItemProperty -Path $f -Name IsReadOnly -Value $false -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $f -Force -ErrorAction Stop
    Write-Host "removed  $f" -ForegroundColor Yellow
  } catch {
    $failed += $f
    Write-Warning ("could not remove {0}: {1}  (a scanner may hold it for a moment; re-run)" -f $f, $_.Exception.Message)
  }
}
if ($failed.Count -gt 0) { exit 3 }
Write-Host "done - locks cleared." -ForegroundColor Green
