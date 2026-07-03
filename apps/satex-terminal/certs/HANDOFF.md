# SATEX — Authenticode Code-Signing Handoff

**Status as of 2026-05-19:** CSR generated, build infrastructure ready. Awaiting
CA-issued certificate.

This file documents the exact steps to get the SATEX installer signed. The
private key for the CSR below lives in the Windows CurrentUser cert store on
the build machine (created via `certreq -new` from `satex-codesign.inf`).
**Do not delete that key** — the issued cert must be paired with it via
`certreq -accept`.

---

## 1. Files in this directory

| File | Purpose | Safe to commit? |
|------|---------|-----------------|
| `satex-codesign.inf` | INF template used to generate the CSR. Public. | ✅ committed |
| `satex-codesign.csr` | Certificate Signing Request. Submit to CA. Public. | ✅ committed |
| `HANDOFF.md` | This document. | ✅ committed |
| `satex-codesign.cer` | CA-issued certificate (after CA returns it). Public. | ✅ committed |
| `satex-codesign.pfx` | Cert + private key bundle. **Private.** | 🚫 `.gitignore`d |

---

## 2. Choose a CA

For an independent developer / small org shipping a Windows .exe, three reasonable choices in 2026:

| CA | Type | Price/yr | SmartScreen reputation | Notes |
|----|------|----------|------------------------|-------|
| **Sectigo** (Comodo) | EV Code Signing | ~$200 | Excellent | Fastest issuance (~5 business days). USB token required. |
| **DigiCert** | EV Code Signing | ~$400 | Excellent | Premium support. USB token required. |
| **SSL.com** | OV Code Signing | ~$100 | Builds reputation | Cheapest. No USB token (software cert). |

**Recommendation:** Sectigo EV — best price/quality ratio, and EV certs get
instant SmartScreen reputation (no warning on first install). The USB token
constraint matters because EV signing must happen on the token, not from a
software-stored .pfx — the build process changes if you go EV.

**If you go EV:** the workflow below changes after step 4. EV signing requires
either:
- Plug the USB token into the build machine + use `signtool.exe /sha1 <thumbprint>`
- Use a cloud signing service (Sectigo Code Signing on Demand, etc.)
- Set up an HSM-backed CI runner

**For the workflow below I assume an OV cert (software .pfx).** If you go EV,
file an issue and I'll write the EV-specific handoff.

---

## 3. Submit the CSR

1. Open `satex-codesign.csr` in any text editor.
2. Copy the entire contents (including the `-----BEGIN…` and `-----END…` lines).
3. Log into your chosen CA's portal.
4. Start a new code-signing cert order.
5. When asked for the CSR, paste the contents.
6. Complete the CA's identity verification:
   - **Individual:** government ID + proof of address
   - **Organization:** business registration docs + DUNS number + verification call
7. Wait for issuance (3–10 business days for OV, 5–15 for EV).

The CA will email you (or make available in the portal) a `.cer` file or a
`.p7b` certificate chain. Download both if both are offered.

---

## 4. Receive + accept the cert

Place the issued cert in `certs/satex-codesign.cer` (overwriting if needed).
Then **on the build machine** (same machine where the CSR was generated):

```powershell
cd C:\Users\User\mc4\apps\satex-terminal\certs
certreq -accept satex-codesign.cer
```

`certreq -accept` pairs the issued cert with the private key still sitting in
the Windows cert store from the original `certreq -new`. After this command,
verify the binding:

```powershell
Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert |
  Select Subject, Thumbprint, NotAfter, HasPrivateKey
```

You should see your CA-issued cert listed with `HasPrivateKey = True`.

---

## 5. Export to .pfx

Electron-builder needs a .pfx file (PKCS#12 bundle: cert + private key). Export
from the cert store:

```powershell
$thumbprint = '<paste thumbprint from step 4>'
$pwd = Read-Host -AsSecureString -Prompt 'Choose a .pfx password'
$cert = Get-ChildItem Cert:\CurrentUser\My\$thumbprint
Export-PfxCertificate -Cert $cert `
  -FilePath 'C:\Users\User\mc4\apps\satex-terminal\certs\satex-codesign.pfx' `
  -Password $pwd
```

**Choose a strong .pfx password.** It protects the private key when the .pfx
is at rest. You'll set the same password as `CSC_KEY_PASSWORD` env var below.

---

## 6. Configure build environment

The pack script reads two env vars (electron-builder native convention):

```powershell
# In your build shell — one-time per session, NOT persisted to disk:
$env:CSC_LINK         = 'C:\Users\User\mc4\apps\satex-terminal\certs\satex-codesign.pfx'
$env:CSC_KEY_PASSWORD = '<your .pfx password from step 5>'
```

**Never commit these to a shell profile.** The session-scoped env-var pattern
above is the safest — they live only as long as the PowerShell window is open.
For CI, use whatever secret-store the CI provider offers (GitHub Actions:
repository secrets; Azure DevOps: variable groups marked as secret).

---

## 7. Build a signed installer

```powershell
cd C:\Users\User\mc4\apps\satex-terminal
npm run pack:win
```

`prepack:check` will print `installer WILL BE SIGNED` when env vars are set.
The build runs `electron-builder --win --x64` which auto-detects `CSC_LINK`
and signs the .exe with `signtool.exe` under the hood. Expect ~30s extra
build time for signing + timestamping.

---

## 8. Verify the signature

```powershell
Get-AuthenticodeSignature 'dist\SATEX Setup 0.4.3.exe' |
  Select Status, StatusMessage, SignerCertificate
```

Expected output:
```
Status            : Valid
StatusMessage     : Signature verified.
SignerCertificate : Subject contains "SATEX Trading Systems"
```

If `Status` is anything other than `Valid` — STOP. Don't ship. Possible causes:
- `NotSigned`: env vars weren't picked up; check `$env:CSC_LINK` is set in the
  same shell where you ran `pack:win`.
- `HashMismatch` / `NotTrusted`: cert chain doesn't validate. Re-run
  `certreq -accept` with the full chain (the .p7b version of the CA reply).
- `UnknownError`: usually means the .pfx is missing the chain. Use
  `certutil -dump satex-codesign.pfx` to inspect.

---

## 9. Renewal (annual)

OV certs are valid 1–3 years. Track the `NotAfter` from step 4. ~30 days before
expiry: generate a new CSR (rerun `certreq -new`), submit to the CA for a
renewal order (cheaper than a new cert), repeat steps 4–7 with the new files.

Keep the OLD .pfx until the new one is verified working — Authenticode
timestamps stay valid past cert expiry, so installers signed under the old
cert remain trusted as long as they were signed before expiry.

---

## 10. CI/CD wiring (future)

When the v0.5.0 auto-update infra lands (S1-9, currently blocked on this S1-8),
the build will move to GitHub Actions. The signing pipeline there uses:

```yaml
# .github/workflows/release.yml (sketch — implement when S1-9 starts)
env:
  CSC_LINK: ${{ secrets.SATEX_PFX_BASE64 }}      # base64-encoded .pfx
  CSC_KEY_PASSWORD: ${{ secrets.SATEX_PFX_PASSWORD }}
```

electron-builder accepts a base64-encoded .pfx via `CSC_LINK` natively — no
file write required. Generate with:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('certs\satex-codesign.pfx')) | Set-Clipboard
```

Then paste into the GitHub repo secret named `SATEX_PFX_BASE64`.
