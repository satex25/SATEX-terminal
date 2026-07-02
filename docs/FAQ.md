# FAQ / Troubleshooting

**Q: `npm run knip` runs out of memory in a sandboxed/container environment.**
Known limitation — `oxc-parser` can hit a 2 GB ArrayBuffer ceiling in
constrained sandboxes. It is not a code defect; CI (Ubuntu) is the arbiter.

**Q: Tests fail with a better-sqlite3 ABI error after switching Node versions.**
Run `npm run rebuild:native` from `apps/satex-terminal/` (or reinstall —
`postinstall` rebuilds against the Electron ABI).

**Q: Why is there no signed Windows installer yet?**
Shipping a signed installer is gated on an Authenticode certificate. The CSR
is ready at `apps/satex-terminal/certs/`; once a `.pfx` lands,
`npm run pack:win` signs with zero code changes. See `certs/HANDOFF.md`.

**Q: The app writes its vault to a weird location under a packaged install.**
Set `SATEX_VAULT_ROOT` to the intended vault directory. In dev the vault root
is auto-discovered by walking up from the app dir to the directory containing
`.obsidian/`.

**Q: Editing large CRLF `.tsx` files with naive string-replacement tooling
truncated a file. How do I recover?**
`git show HEAD:<path>` is the clean source of truth — restore from git
objects. For risky edits on such files prefer scripted (e.g. Python) edits.

**Q: Where do I report a bug or track open problems?**
`Vault/00-Audit/PROBLEM-LEDGER.md` — the living PSD queue. Entries are never
deleted; closed ones sink to §Closed with evidence.

**Q: Can an agent/model place or cancel a real order, or arm live mode?**
No. Never. Arming live capital is a human typed-phrase ceremony; autonomous
execution exists paper-only behind the full risk-gate battery. See
`CONSTITUTION.md` §0.2 and §3.7.
