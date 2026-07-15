# Security policy

## Supported versions

SATEX is pre-1.0; only the latest `master` and the most recent tagged release
are supported.

## Reporting a vulnerability

Open a **private** GitHub security advisory on
[satex25/SATEX-terminal](https://github.com/satex25/SATEX-terminal/security/advisories),
or contact the repository owner directly. Please do not open public issues for
security problems in a trading terminal with a live-capital path.

## Credential handling (invariants)

- Broker API keys live in **Electron `safeStorage` only** — never plaintext in
  `userData`, logs, env files, or code.
- IPC payloads are Zod-validated `.strict()` — no raw object passing, no
  unvalidated channels.
- The renderer runs sandboxed (`sandbox: true`, `contextIsolation: true`,
  `nodeIntegration: false`); every privileged operation is delegated to main
  via validated IPC.
- Code-signing material (`apps/satex-terminal/certs/`) must never contain a
  private key in the repo — the CSR is public, the `.pfx` lives only on the
  build machine.

## Safety-relevant findings

A discovered bypass of any trading-safety interlock (arming ceremony, risk
gates, kill switch, MAY-TACTICS) is a security finding of the first order:
report it, never exercise it.
