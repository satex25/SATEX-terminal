# docs/ — Workspace-level documentation

Workspace-scoped reference material that lives outside the app directory.
App-internal docs (design specs, release procedures, ultraplans) live in
`satex-app/docs/`.

## Structure

| Directory | Contents |
|---|---|
| `policy/` | Governing documents: agent operating constitution (`rule-VS.md`), full UI/UX design brief (`SATEX-CLAUDE-DESIGN-PROMPT.md`) |
| `plans/` | Workspace-level ultraplans (strategic direction, forward-test foundation) |
| `vendor/` | Third-party library reference extracts (`fs-extra/` API snippets) |

## Key files

- `policy/rule-VS.md` — AI-agent operational constitution (INFRASTRUCTURE MANDATE).
  Every model must read this before acting on the repo.
- `policy/SATEX-CLAUDE-DESIGN-PROMPT.md` — Full terminal v3 UI/UX design brief.
  Reference when touching the renderer's design system (`--bb-*` tokens, component inventory).

## What goes here vs satex-app/docs/

| Here (`docs/`) | App docs (`satex-app/docs/`) |
|---|---|
| Workspace policy and governing rules | App design specs and decision records |
| Strategic direction plans | Release checklists and procedures |
| Third-party vendor references | Component ultraplans and implementation specs |
| Workspace-wide audits | Funded programme master plans |
