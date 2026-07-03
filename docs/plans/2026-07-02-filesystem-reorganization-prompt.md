# SATEX PROJECT FILESYSTEM REORGANIZATION
## Executive Directive for Production-Grade Architecture

**TARGET REPOSITORY:** `C:\Users\User\mc4`  
**OBJECTIVE:** Complete filesystem reorganization into production-grade, GitHub-ready structure  
**AUTHORITY:** Col Marten (Project Owner)  
**DATE:** 2026-07-02  
**CLASSIFICATION:** PRODUCTION-CRITICAL REORGANIZATION  

---

## EXECUTIVE SUMMARY

SATEX is an institutional-grade, Windows-only Electron + React 18 + TypeScript autonomous trading terminal with live-capital execution via Alpaca. The current filesystem is scattered across 100+ files distributed across the root, subdirectories, and multiple nesting levels without clear architectural separation. 

**This reorganization will:**
- ✅ Establish a **professional, enterprise-grade folder structure** that scales beyond 20k+ files
- ✅ Achieve **GitHub-ready** layout conforming to TypeScript/Node.js monorepo conventions
- ✅ Implement **clear separation of concerns** (source code, documentation, infrastructure, reference)
- ✅ **Preserve 100% of Git history** (operations use `git mv` only, never copy/delete)
- ✅ **Eliminate ambiguity** in file placement and developer navigation
- ✅ **Future-proof** for multi-package monorepo expansion

**Outcome:** A project structure that would pass code review at FAANG, institutional quant firms, and top-tier open-source projects.

---

## SECTION 1: ARCHITECTURAL PRINCIPLES

### 1.1 Guiding Philosophy

The reorganized structure must embody:

1. **Hierarchical Clarity** — A developer opening the repo root can immediately understand: "Where is the app code? Where are docs? Where is infrastructure? Where are tests?"

2. **Monorepo-First** — Even if SATEX is currently single-package, the structure must accommodate future expansion (broker-abstraction library, CLI tooling, analytics pipeline, market-data ingestion sidecar).

3. **GitHub Compatibility** — Structure must work seamlessly with GitHub Pages, GitHub Actions CI/CD, GitHub's default .gitignore suggestions, and typical open-source conventions.

4. **Searchability** — No developer should have to hunt for a file. Path naming should be descriptive, semantic, and predictable.

5. **Artifact Containment** — Build outputs, logs, temporary files, and IDE artifacts should be isolated from source code.

6. **Configurability Consistency** — All configuration files (env, build, lint, test) at the root of their logical package.

---

## SECTION 2: TARGET FILESYSTEM ARCHITECTURE

### 2.1 Root-Level Directory Structure

```
mc4/
├── .github/                          # GitHub Actions CI/CD, issue templates, PR templates
│   ├── workflows/
│   │   ├── ci.yml
│   │   ├── release.yml
│   │   └── security-scan.yml
│   ├── ISSUE_TEMPLATE/
│   ├── PULL_REQUEST_TEMPLATE/
│   └── dependabot.yml
│
├── .husky/                           # Git hooks (pre-commit, commit-msg, pre-push)
│
├── apps/                             # Monorepo packages (Electron app is primary)
│   └── satex-terminal/               # Rename from 00-PROJECT-ROOT/01-SATEX-CORE/satex-app
│       ├── src/                      # Source code (unchanged structure)
│       ├── tests/                    # Test suites (unchanged structure)
│       ├── docs/                     # App-specific documentation
│       ├── resources/                # App-level resources (icons, templates)
│       ├── certs/                    # Code-signing certificates
│       ├── scripts/                  # Build & dev scripts
│       ├── package.json
│       ├── tsconfig.json
│       ├── tsconfig.node.json
│       ├── tsconfig.web.json
│       ├── electron.vite.config.ts
│       ├── electron-builder.yml
│       ├── playwright.config.ts
│       ├── eslint.config.mjs
│       ├── tailwind.config.js
│       ├── postcss.config.js
│       ├── knip.json
│       ├── knip-wrapper.mjs
│       ├── CLAUDE.md
│       ├── CHANGELOG.md
│       ├── README.md
│       ├── LICENSE
│       └── .env.local.example
│
├── docs/                             # Root-level, project-wide documentation
│   ├── README.md                     # Docs index
│   ├── ARCHITECTURE.md               # System architecture (repo-level)
│   ├── CONSTITUTION.md               # SATEX behavioral constitution (moved from root)
│   ├── AGENTS.md                     # Workflow & governance (moved from root)
│   ├── GETTING-STARTED.md            # First-time setup guide
│   ├── CONTRIBUTING.md               # Contribution guidelines
│   ├── SECURITY.md                   # Security policy & vulnerability disclosure
│   ├── FAQ.md                        # Frequently asked questions
│   ├── design/                       # Design specs & decisions
│   │   ├── 2026-06-01-alpaca-broker-session-design.md
│   │   ├── 2026-05-24-data-feed-switch.md
│   │   ├── 2026-05-22-renderer-perf-budget.md
│   │   └── [other design docs]
│   ├── guides/                       # How-to guides
│   │   ├── alpaca-setup.md
│   │   ├── alpaca-cli-integration.md
│   │   ├── paper-trading-workflow.md
│   │   └── [other guides]
│   ├── reference/                    # Reference material
│   │   ├── glossary.md
│   │   ├── api-endpoints.md
│   │   └── [other references]
│   └── superpowers/                  # Special features / advanced topics
│       ├── specs/
│       │   ├── 2026-06-01-alpaca-broker-session-design.md
│       │   └── [other specs]
│       └── [other content]
│
├── infrastructure/                   # DevOps, deployment, cloud config
│   ├── docker/
│   │   ├── Dockerfile
│   │   └── docker-compose.yml
│   ├── ci-cd/
│   │   ├── build-scripts/
│   │   └── release-checklist.md
│   ├── signing/
│   │   ├── HANDOFF.md
│   │   └── [signing instructions]
│   └── [cloud provisioning files, if any]
│
├── scripts/                          # Root-level automation (git, release, etc.)
│   ├── setup.sh                      # Clone setup (git hooks, npm install)
│   ├── pre-commit.sh
│   └── [other utilities]
│
├── vault/                            # Project knowledge vault (renamed from Vault/)
│   ├── README.md                     # Vault index
│   ├── settings/                     # User preferences, configs
│   │   ├── subsecond-prefs.md
│   │   └── [other settings]
│   ├── audit/                        # Audit trail, problem ledger
│   │   ├── PROBLEM-LEDGER.md         # Living PSD queue
│   │   └── [audit logs]
│   └── reference/                    # Reference material (not design docs)
│       ├── glossary.md
│       └── [other reference]
│
├── reference/                        # Renamed from 90-REFERENCE/
│   ├── README.md                     # Reference index
│   ├── git-bundles/                  # Git rebase bundles (d2-rebase-input.bundle, etc.)
│   ├── archived-drafts/              # Old design proposals
│   └── [other reference material]
│
├── .git/                             # Git repository (unchanged)
├── .gitignore
├── .gitattributes
│
├── .obsidian/                        # Obsidian vault config (optional, can stay)
├── .claude/                          # Claude Code config (optional, can stay)
├── .env                              # Root env (if needed for monorepo)
│
├── .npmrc                            # NPM configuration (monorepo settings)
├── .prettierrc.json                  # Code formatter config (root-level)
├── .editorconfig                     # Editor config (root-level)
│
├── package.json                      # Root monorepo package.json (workspaces)
├── package-lock.json                 # Root lockfile (or pnpm-lock.yaml)
│
├── README.md                         # Root project README (GitHub landing page)
├── LICENSE                           # MIT or Apache 2.0
├── CHANGELOG.md                      # Root changelog (roll-up of app changelog)
├── CLAUDE.md                         # Root-level Claude Code instructions
│
└── .trash/                           # Temporary trash (excluded from git)
```

---

## SECTION 3: FILE MOVEMENT MANIFEST

### 3.1 Root-Level Files → New Homes

| Current Location | New Location | Rationale |
|---|---|---|
| `AGENTS.md` | `docs/AGENTS.md` | Workflow & governance docs belong in docs/ |
| `ARCHITECTURE.md` | `docs/ARCHITECTURE.md` | System architecture documentation |
| `CONSTITUTION.md` | `docs/CONSTITUTION.md` | Behavioral constitution is documentation |
| `CLAUDE.md` (root) | Keep at root | Project-level Claude Code instructions stay at root |
| `ALPACA_CLI_SETUP.md` | `docs/guides/alpaca-setup.md` | Setup guide → guides/ |
| `ALPACA_CLI_SATEX_INTEGRATION.md` | `docs/guides/alpaca-cli-integration.md` | Integration guide → guides/ |
| `HOME.md` | `docs/README.md` or `docs/index.md` | Project introduction becomes docs index |
| `SATEX-CLAUDE-DESIGN-PROMPT.md` | `docs/design/SATEX-claude-design-prompt.md` | Design documentation |
| `rule-VS.md` | `docs/reference/rule-vs.md` | Reference material |
| `README.md` (root) | Keep at root | Root README is GitHub landing page |
| `LICENSE` | `apps/satex-terminal/LICENSE` | License lives with the package |
| `.pr-body-*.md` | Archived in `reference/archived-drafts/` | Historical PR templates → archive |
| `CLEANUP-STALE-FILES.bat` | `scripts/cleanup.sh` | Root scripts → scripts/ |
| `FETCH-D2-FOR-REBASE.bat` | `scripts/git-rebase/fetch-d2.sh` | Git operations → scripts/git-rebase/ |
| `PUSH-D2-TO-GITHUB.bat` | `scripts/git-rebase/push-d2.sh` | Git operations → scripts/git-rebase/ |
| `PUSH-L1D-TO-GITHUB.bat` | `scripts/git-rebase/push-l1d.sh` | Git operations → scripts/git-rebase/ |
| `*.bundle` | `reference/git-bundles/` | Git bundles → reference/ |
| `Screenshot *.png` | `reference/archived-screenshots/` | Screenshots → reference/ (not in git) |
| `*-rebase*.log`, `gates-results.log`, `push-*.log` | Ignored (build artifacts) | Add to .gitignore |
| `electron-vite-dev.log` | Ignored (build artifacts) | Add to .gitignore |
| `.pr-body-*.md` | Archive in `reference/archived-pr-templates/` | Historical PR templates |

### 3.2 Subdirectory Reorganization

| Current | New | Action |
|---|---|---|
| `00-PROJECT-ROOT/01-SATEX-CORE/satex-app/` | `apps/satex-terminal/` | **Rename** (use `git mv`) |
| `Vault/` | `vault/` | **Rename** to lowercase; restructure content |
| `90-REFERENCE/` | `reference/` | **Rename** to semantic name |
| `docs/` (root-level) | `docs/` | **Merge** with new root docs/; app docs move to `apps/satex-terminal/docs/` |
| `scripts/` (root) | `scripts/` | **Consolidate** root and app scripts appropriately |
| `.github/` | Keep at root | Already properly placed |
| `.husky/` | Keep at root | Already properly placed |
| `node_modules/` | `apps/satex-terminal/node_modules/` | Already there (no change) |
| `dist/`, `out/` | `apps/satex-terminal/dist/`, `apps/satex-terminal/out/` | Build outputs already in app (no change) |

### 3.3 New Files to Create

| Path | Purpose | Content |
|---|---|---|
| `docs/README.md` | Docs index | Navigation to all documentation |
| `docs/GETTING-STARTED.md` | First-time setup | Clone setup, install, first run |
| `docs/CONTRIBUTING.md` | Contribution guidelines | Code style, PR flow, testing requirements |
| `docs/SECURITY.md` | Security policy | Vulnerability disclosure, API key safety |
| `docs/FAQ.md` | Common questions | Troubleshooting, common issues |
| `scripts/setup.sh` | Monorepo setup | Install git hooks, install dependencies |
| `infrastructure/ci-cd/release-checklist.md` | Release procedure | Manual checks before release |
| `vault/README.md` | Vault index | What's in the vault, how to use it |
| `reference/README.md` | Reference index | What's in reference/ and why |
| `README.md` (root, updated) | GitHub landing page | Project intro, badges, quick start |
| `package.json` (root) | Monorepo root | Workspaces definition, root scripts |
| `.prettierrc.json` | Code formatter | Shared formatting rules |
| `.editorconfig` | Editor config | Shared editor rules |

---

## SECTION 4: EXECUTION PROTOCOL

### 4.1 Safety-First Approach

**BEFORE ANY FILE MOVEMENT:**

1. ✅ Verify current Git status is clean
   ```bash
   git status
   ```
   (Must be on a clean branch with no uncommitted changes)

2. ✅ Create a reorganization branch
   ```bash
   git checkout -b refactor/filesystem-reorganization
   ```

3. ✅ Document current state
   ```bash
   git log --oneline -10
   git config user.name
   git config user.email
   ```

### 4.2 Git-Native Movement (Never Copy/Delete)

**CRITICAL RULE:** Use `git mv` exclusively. This preserves:
- Full commit history for every file
- Blame attribution chains
- Rename detection

**Pattern:**
```bash
git mv src/old/path.ts src/new/path.ts
git commit -m "refactor: move path.ts to new location"
```

### 4.3 Execution Phases

#### **Phase 1: Create Directory Structure** (No file movement yet)
- Create all new directories in the target structure
- Directories created empty (except for README.md files)
- Commit: `"refactor: establish new filesystem architecture"`

#### **Phase 2: Move Root-Level Documentation**
- Move `*.md` files from root to `docs/` using `git mv`
- Reorganize into subdirectories (guides/, design/, reference/)
- Update all internal references (links in docs)
- Commit per logical group (e.g., "refactor: move architecture docs")

#### **Phase 3: Move Configuration Files**
- Move `.env.local.example` to `apps/satex-terminal/`
- Move build config files if at root to app directory
- Update `.gitignore` patterns
- Commit: `"refactor: organize configuration files"`

#### **Phase 4: Move Build Artifacts & Logs**
- Move `*.bundle` files to `reference/git-bundles/`
- Move `.log` files to `.trash/` or delete (add patterns to `.gitignore`)
- Move screenshots to `reference/archived-screenshots/`
- Commit: `"refactor: archive build artifacts and logs"`

#### **Phase 5: Move App Directory**
- This is the **largest move** — use `git mv` from `00-PROJECT-ROOT/01-SATEX-CORE/satex-app/` to `apps/satex-terminal/`
- Verify all internal imports still work
- Run type-check & tests post-move
- Commit: `"refactor: relocate satex-terminal to monorepo apps/ structure"`

#### **Phase 6: Reorganize vault/ and reference/**
- Move Vault contents to `vault/`
- Rename files to lowercase where appropriate
- Move reference materials to `reference/`
- Commit: `"refactor: reorganize vault and reference materials"`

#### **Phase 7: Create Root Monorepo Files**
- Create root `package.json` with workspaces
- Create `README.md` (GitHub landing page)
- Create `.prettierrc.json`, `.editorconfig`
- Commit: `"refactor: establish monorepo configuration at root"`

#### **Phase 8: Update Imports & References**
- Search entire codebase for hardcoded paths
- Update any documentation cross-references
- Update CI/CD scripts (GitHub Actions) to reflect new paths
- Run full test suite
- Commit: `"refactor: update imports and documentation links"`

#### **Phase 9: Cleanup Empty Directories**
- Remove `00-PROJECT-ROOT/` and `90-REFERENCE/` if empty
- Verify `.gitignore` properly ignores build artifacts
- Final cleanup commit: `"refactor: remove obsolete directory structures"`

### 4.4 Post-Movement Verification

**Every commit, verify:**

```bash
# Lint & type-check the entire app
cd apps/satex-terminal
npm run typecheck
npm run lint
npm test
npm run knip

# Verify git history is preserved
git log --follow -- <moved-file>
```

**Before PR submission:**

```bash
# Full gate check
cd apps/satex-terminal
npm run typecheck && npm run lint && npm test && npm run knip

# Verify directory structure
ls -la mc4/ | grep -E "^d"  # Should show new structure
```

---

## SECTION 5: IMPLEMENTATION GUIDELINES

### 5.1 Directory Naming Conventions

- **Directories:** lowercase, hyphenated (e.g., `git-bundles`, `archived-drafts`)
- **Files:** PascalCase for markdown docs (e.g., `CONTRIBUTING.md`, `SECURITY.md`), lowercase-hyphenated for guides (e.g., `alpaca-setup.md`)
- **Source code:** Unchanged (already follows conventions)

### 5.2 Documentation Standards

Every major directory should have a `README.md`:

- `docs/README.md` — Docs index with navigation
- `vault/README.md` — Vault purpose and contents
- `reference/README.md` — Reference materials index
- `infrastructure/README.md` — Infrastructure overview

### 5.3 .gitignore Updates

Add patterns for build artifacts:

```gitignore
# Build outputs
dist/
out/
*.tsbuildinfo

# Logs
*.log
electron-vite-dev.log
gates-results.log

# IDE artifacts
.DS_Store
Thumbs.db

# Temporary files
.trash/
*.tmp

# Environment
.env.local
```

### 5.4 Root package.json (Monorepo Configuration)

```json
{
  "name": "satex-monorepo",
  "version": "1.0.0",
  "description": "SATEX: Autonomous Trading Intelligence System",
  "private": true,
  "workspaces": [
    "apps/satex-terminal"
  ],
  "scripts": {
    "setup": "bash scripts/setup.sh",
    "build": "npm -w apps/satex-terminal run build",
    "test": "npm -w apps/satex-terminal test",
    "lint": "npm -w apps/satex-terminal run lint",
    "typecheck": "npm -w apps/satex-terminal run typecheck"
  }
}
```

### 5.5 GitHub Readiness Checklist

After reorganization:

- ✅ Root README.md with project overview, badges, quick-start
- ✅ LICENSE file at root
- ✅ .github/workflows/ with CI/CD pipelines
- ✅ CONTRIBUTING.md with contribution guidelines
- ✅ SECURITY.md with vulnerability policy
- ✅ docs/ with architecture, guides, design decisions
- ✅ No sensitive data in any committed file (keys stay in safeStorage)
- ✅ .gitignore properly configured
- ✅ No build artifacts or logs in git
- ✅ All internal links work (no broken relative paths)

---

## SECTION 6: EXPECTED OUTCOMES

### 6.1 Post-Reorganization State

**GitHub URL should reveal:**
- Professional folder structure at first glance
- Clear documentation hierarchy
- Monorepo-ready architecture
- Enterprise-grade organization

**Developer experience:**
- Faster navigation to files
- Clear ownership of content (who maintains what)
- Easier onboarding for new contributors
- Scalable for future packages (broker libraries, CLI, market-data pipeline)

**Quality signals:**
- ✅ All tests pass
- ✅ All linters pass
- ✅ No dead code
- ✅ Git history 100% preserved
- ✅ CI/CD pipeline still works

---

## SECTION 7: CRITICAL CONSTRAINTS & GOTCHAS

### 7.1 Do NOT

❌ **Use `cp` or `copy` commands** — use `git mv` only  
❌ **Delete files directly** — use `git rm`  
❌ **Edit file paths in imports manually** — let tooling handle it  
❌ **Commit log files or build artifacts** — add to `.gitignore`  
❌ **Break internal documentation links** — update all cross-references  
❌ **Modify CLAUDE.md** while reorganizing — leave it alone (it's instruction content)  

### 7.2 Do

✅ **Use `git mv` for every file movement**  
✅ **Commit logically grouped changes** (not one-file-per-commit)  
✅ **Run full test suite after Phase 5** (app directory move)  
✅ **Update .gitignore before Phase 4** (artifact archival)  
✅ **Verify links in docs post-reorganization**  
✅ **Test CI/CD pipeline on reorganization branch**  

### 7.3 Known Risks & Mitigations

| Risk | Symptom | Mitigation |
|---|---|---|
| Import path breaks | Tests fail with "module not found" | Run tests after Phase 5; grep for hardcoded paths |
| Link breakage in docs | Dead links to files | Search-replace all `../docs/` patterns post-move |
| CI/CD fails | GitHub Actions can't find package.json | Update workflow YML to reference new paths |
| Blame history lost | `git blame` shows move commit, not original | Use `git blame --follow` to trace through renames |
| Merge conflicts | Rebase with other branches breaks | Rebase this branch early, close to main |

---

## SECTION 8: SUCCESS CRITERIA

This reorganization is **complete & successful** when:

1. ✅ All files are in target locations (git mv'd, not copied)
2. ✅ All 4 gates pass (`typecheck`, `lint`, `test`, `knip`)
3. ✅ CI/CD pipeline runs successfully on reorganization branch
4. ✅ No broken documentation links (test with link checker)
5. ✅ Git blame & history preserved for all files
6. ✅ Root README displays professional project introduction
7. ✅ Directory structure matches target architecture exactly
8. ✅ All internal relative paths resolved correctly
9. ✅ PR description explains reorganization rationale
10. ✅ No build artifacts or logs in git-tracked files

---

## SECTION 9: FINAL NOTES FOR THE AGENT

### Instructions for the Executing Model

You are tasked with executing the above specification with **zero ambiguity** and **maximum precision**. This is production infrastructure work on a financial trading system — execution quality matters.

**Before starting:**
1. Review this entire prompt
2. Ask clarifying questions if any ambiguity exists
3. Take a screenshot of the current state: `ls -laR C:\Users\User\mc4` (top-level)
4. Proceed phase-by-phase, committing after each logical group

**During execution:**
- Narrate each major action: "Moving AGENTS.md to docs/AGENTS.md..."
- Report actual exit codes and command results (not guesses)
- Stop immediately if any gate fails — do not proceed past Phase 5 until all tests pass
- Keep a running log of all git mv commands executed

**After completion:**
- Provide final directory tree (ascii art)
- Confirm all 4 gates pass
- List all committed phase commits
- Verify git log --follow works for 3 sample files

### Authority & Approval

This prompt is authorized by the project owner (Col Marten) and supersedes all prior ad-hoc organization. Execute with full autonomy; no additional approval needed per-phase. If human decision is required (e.g., "should this file go here or there?"), stop and request clarification.

**Timeline:** Execute in one session (not split across multiple conversations). Final PR should be ready for merge upon completion.

---

**END PROMPT**

---

**ADDENDUM: Quick Reference — Where Things Go**

```
Questions? Consult this quick map:

Documentation → docs/
  Architecture → docs/ARCHITECTURE.md
  Guides → docs/guides/
  Design Specs → docs/design/
  Reference → docs/reference/

Configuration & Scripts → Root or apps/satex-terminal/
  Package config → apps/satex-terminal/package.json
  Build config → apps/satex-terminal/electron-builder.yml
  Root setup scripts → scripts/

App Source Code → apps/satex-terminal/
  TypeScript source → apps/satex-terminal/src/
  Tests → apps/satex-terminal/tests/
  Specific docs → apps/satex-terminal/docs/

Project Knowledge → vault/
  Settings → vault/settings/
  Audit trail → vault/audit/
  Useful reference → vault/reference/

Historical/Archived → reference/
  Git bundles → reference/git-bundles/
  Old drafts → reference/archived-drafts/
  Screenshots → reference/archived-screenshots/
```

