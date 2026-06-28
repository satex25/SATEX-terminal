@echo off
REM ============================================================
REM SATEX — Phase 1: chore/repo-root-cleanup branch
REM Covers §3.1 (root noise), §3.2 (doc dupes), §3.3 (docs taxonomy)
REM Run from repo root (mc4/)
REM ============================================================
cd /d C:\Users\User\mc4
setlocal

echo === [0] Repair git index if needed ===
git status --short >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo INDEX CORRUPT - rebuilding...
  del .git\index
  git reset
)
echo INDEX OK

echo === [1] Create branch chore/repo-root-cleanup ===
git checkout -b chore/repo-root-cleanup
echo BRANCH_EXIT=%ERRORLEVEL%

echo === [2] Run cleanup-root.ps1 (removes root noise) ===
powershell -ExecutionPolicy Bypass -File scripts\cleanup-root.ps1
echo CLEANUP_EXIT=%ERRORLEVEL%

echo === [3] git add all doc changes ===
REM New files
git add docs\README.md
REM Updated ARCHITECTURE.md, AGENTS.md
git add ARCHITECTURE.md AGENTS.md
REM New app docs README
git add 00-PROJECT-ROOT\01-SATEX-CORE\satex-app\docs\README.md
REM Updated CHANGELOG
git add 00-PROJECT-ROOT\01-SATEX-CORE\satex-app\CHANGELOG.md
REM New scripts dir
git add scripts\
REM docs/policy/ (canonical — no change needed, but stage if modified)
git add docs\policy\

echo === [4] Stage root deletions (tracked files removed by cleanup.ps1) ===
REM These were git-tracked — cleanup.ps1 Remove-Item'd them; git needs to know
git rm --cached --ignore-unmatch rule-VS.md SATEX-CLAUDE-DESIGN-PROMPT.md
git rm --cached --ignore-unmatch HOME.md
echo RM_EXIT=%ERRORLEVEL%

echo === [5] git status ===
git -c core.autocrlf=true status --short

echo === [6] Commit ===
git commit -m "chore(structure): root cleanup, docs taxonomy, scope READMEs

§3.1: Removed root noise (bundles, one-shot bats, stale PR bodies, garbage
      .txt files, chrome-devtools-mcp package.json/node_modules).
§3.2: docs/policy/ is now canonical for rule-VS.md and SATEX-CLAUDE-DESIGN-
      PROMPT.md. Root duplicate copies removed (were CRLF variants of LF
      originals). HOME.md moved to Vault/HOME.md (Obsidian cockpit).
§3.3: Added docs/README.md (workspace) and satex-app/docs/README.md (app)
      so each docs tree is self-describing.
      Renamed docs/superpowers/ → docs/plans/ (root and app level).

Updated: ARCHITECTURE.md §1 workspace map + services taxonomy + baseline,
         AGENTS.md (docs/policy/rule-VS.md pointer added),
         CHANGELOG.md (Unreleased entries for §3.1-§3.4),
         scripts/cleanup-root.ps1, scripts/flatten-wrapper.ps1 added.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
echo COMMIT_EXIT=%ERRORLEVEL%

echo === [7] Push ===
git push origin chore/repo-root-cleanup
echo PUSH_EXIT=%ERRORLEVEL%

echo === [8] Final log ===
git log --oneline -5
echo.
echo === Phase 1 done — open PR: chore/repo-root-cleanup ===
pause
endlocal
