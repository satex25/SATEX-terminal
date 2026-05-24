/**
 * SATEX credential-persistence E2E (opt-in). Saves Alpaca paper creds, closes,
 * relaunches the SAME profile, and asserts the creds (and live-feed availability)
 * survived — the safeStorage round-trip that no unit test can cover.
 *   $env:SATEX_E2E_FEED='1'; npx playwright test tests/e2e/creds-persistence.spec.ts
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import path from 'path'
import os from 'os'
import { existsSync, mkdtempSync, rmSync } from 'fs'

const ENABLED    = process.env['SATEX_E2E_FEED'] === '1'
const MAIN_ENTRY = path.join(__dirname, '..', '..', 'out', 'main', 'index.js')

async function launch(profile: string): Promise<ElectronApplication> {
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${profile}`],
    env: { ...process.env, USE_SIMULATOR: 'true', NODE_ENV: 'production', SATEX_VAULT_ROOT: path.join(profile, 'vault') },
    timeout: 30_000,
  })
  await app.evaluate(({ BrowserWindow }) => { for (const w of BrowserWindow.getAllWindows()) { try { w.setPosition(-4000, -4000); w.setOpacity(0); w.setSkipTaskbar(true) } catch { /* ignore */ } } })
  return app
}

test.describe('credential persistence across relaunch', () => {
  test.skip(!ENABLED, 'set SATEX_E2E_FEED=1 to run')

  test('saved Alpaca paper keys survive close + relaunch', async () => {
    test.setTimeout(120_000)
    if (!existsSync(MAIN_ENTRY)) throw new Error('out/main/index.js missing. Run `npm run build` first.')
    const profile = mkdtempSync(path.join(os.tmpdir(), 'satex-creds-'))

    // ── Launch 1: save creds ──
    const app1 = await launch(profile)
    try {
      const win1: Page = await app1.firstWindow({ timeout: 20_000 })
      await win1.waitForLoadState('domcontentloaded', { timeout: 20_000 })
      await win1.locator('.bb-watchlist-row').first().waitFor({ state: 'visible', timeout: 20_000 })
      const saved = await win1.evaluate(() => (window as unknown as { satex: { setCredentials(r: unknown): Promise<{ ok: boolean; reason?: string }> } }).satex.setCredentials({ keyId: 'PERSIST_TEST_KEY', secretKey: 'PERSIST_TEST_SECRET', feed: 'iex', mode: 'paper' }))
      test.skip(!saved.ok, `safeStorage unavailable on this machine: ${saved.reason ?? ''}`)
      const masked1 = await win1.evaluate(() => (window as unknown as { satex: { getCredentialsMasked(): Promise<{ paperConfigured: boolean }> } }).satex.getCredentialsMasked())
      expect(masked1.paperConfigured).toBe(true)
    } finally {
      try { await app1.close() } catch { /* ignore */ }
    }

    // ── Launch 2: same profile, assert persisted ──
    const app2 = await launch(profile)
    try {
      const win2: Page = await app2.firstWindow({ timeout: 20_000 })
      await win2.waitForLoadState('domcontentloaded', { timeout: 20_000 })
      await win2.locator('.bb-watchlist-row').first().waitFor({ state: 'visible', timeout: 20_000 })
      const masked2 = await win2.evaluate(() => (window as unknown as { satex: { getCredentialsMasked(): Promise<{ paperConfigured: boolean }> } }).satex.getCredentialsMasked())
      expect(masked2.paperConfigured, 'paper creds did NOT survive relaunch').toBe(true)
      const ds = await win2.evaluate(() => (window as unknown as { satex: { getDataSource(): Promise<{ liveAvailable: boolean }> } }).satex.getDataSource())
      expect(ds.liveAvailable, 'live feed not available after relaunch despite persisted creds').toBe(true)
    } finally {
      try { await app2.close() } catch { /* ignore */ }
      try { rmSync(profile, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  })
})
