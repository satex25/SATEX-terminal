# docs/ — Workspace-level documentation

Workspace-scoped reference material that lives outside the app directory.
App-internal docs (design specs, release procedures, ultraplans) live in
`apps/satex-terminal/docs/`.

## Structure

| Directory | Contents |
|---|---|
| `policy/` | Governing documents: agent operating constitution (`rule-VS.md`), full UI/UX design brief (`SATEX-CLAUDE-DESIGN-PROMPT.md`) |
| `plans/` | Workspace-level ultraplans and executed plans (strategic direction, forward-test foundation, the 2026-07-02 filesystem reorganization) |
| `guides/` | Setup and integration guides (`alpaca-cli-setup.md`, `alpaca-cli-satex-integration.md`) |
| `vendor/` | Third-party library reference extracts (`fs-extra/` API snippets) |

## Key files

- `policy/rule-VS.md` — AI-agent operational constitution (INFRASTRUCTURE MANDATE).
  Every model must read this before acting on the repo.
- `policy/SATEX-CLAUDE-DESIGN-PROMPT.md` — Full terminal v3 UI/UX design brief.
  Reference when touching the renderer's design system (`--bb-*` tokens, component inventory).

## What goes here vs apps/satex-terminal/docs/

| Here (`docs/`) | App docs (`apps/satex-terminal/docs/`) |
|---|---|
| Workspace policy and governing rules | App design specs and decision records |
| Strategic direction plans | Release checklists and procedures |
| Third-party vendor references | Component ultraplans and implementation specs |
| Workspace-wide audits | Funded programme master plans |

Workspace onboarding docs: [GETTING-STARTED.md](GETTING-STARTED.md) · [CONTRIBUTING.md](apps/satex-terminal/docs%201/CONTRIBUTING.md) · [SECURITY.md](apps/satex-terminal/docs%201/SECURITY.md) · [FAQ.md](FAQ.md)
