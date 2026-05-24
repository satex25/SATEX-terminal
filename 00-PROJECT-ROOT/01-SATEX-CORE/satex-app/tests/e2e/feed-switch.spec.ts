/**
 * SATEX data-feed switch E2E (opt-in). Boots isolated + offscreen under the
 * simulator and exercises the data-source IPC: boot state, no-creds refusal,
 * no-op, and the transactional rollback (bad creds → Alpaca 401 → stays on Sim).
 *   $env:SATEX_E2E_FEED='1'; npx playwright test tests/e2e/feed-switch.spec.ts
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import path from 'path'
import os from 'os'
import { existsSync, mkdtempSync, rmSync } from 'fs'

const ENABLED    = process.env['SATEX_E2E_FEED'] === '1'
const MAIN_ENTRY = path.join(__dirname, '..', '..', 'out', 'main', 'index.js')

test.describe('data-feed switch', () => {
  test.skip(!ENABLED, 'set SATEX_E2E_FEED=1 to run')

  test('boot state, no-creds refusal, no-op, and rollback', async () => {
    test.setTimeout(90_000)
    if (!existsSync(MAIN_ENTRY)) throw new Error('out/main/index.js missing. Run `npm run build` first.')
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'satex-feed-'))
    let app: ElectronApplication | null = null
    const errors: string[] = []
    try {
      app = await electron.launch({
        args: [MAIN_ENTRY, `--user-data-dir=${tmp}`],
        env: { ...process.env, USE_SIMULATOR: 'true', NODE_ENV: 'production', SATEX_VAULT_ROOT: path.join(tmp, 'vault') },
        timeout: 30_000,
      })
      await app.evaluate(({ BrowserWindow }) => { for (const w of BrowserWindow.getAllWindows()) { try { w.setPosition(-4000, -4000); w.setOpacity(0); w.setSkipTaskbar(true) } catch { /* ignore */ } } })
      const win: Page = await app.firstWindow({ timeout: 20_000 })
      win.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
      win.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
      await win.waitForLoadState('domcontentloaded', { timeout: 20_000 })
      await win.locator('.bb-watchlist-row').first().waitFor({ state: 'visible', timeout: 20_000 })

      const ds = () => win.evaluate(() => (window as unknown as { satex: { getDataSource(): Promise<{ source: string; liveAvailable: boolean }> } }).satex.getDataSource())
      const set = (target: 'simulator' | 'live') => win.evaluate((t) => (window as unknown as { satex: { setDataSource(r: { target: string }): Promise<{ ok: boolean; reason?: string }> } }).satex.setDataSource({ target: t }), target)

      // Boot = simulator, no creds → live unavailable.
      expect((await ds()).source).toBe('simulator')
      expect((await ds()).liveAvailable).toBe(false)

      // → live refused with no creds; stays on sim.
      const noCreds = await set('live')
      expect(noCreds.ok).toBe(false)
      expect(noCreds.reason ?? '').toMatch(/keys|Settings/i)
      expect((await ds()).source).toBe('simulator')

      // → simulator is a no-op.
      expect((await set('simulator')).ok).toBe(true)

      // Seed BAD paper creds → live becomes "available" → switch attempts a real
      // Alpaca connect → 401 → prepare fails → ROLLBACK leaves us on simulator.
      const saved = await win.evaluate(() => (window as unknown as { satex: { setCredentials(r: unknown): Promise<{ ok: boolean }> } }).satex.setCredentials({ keyId: 'FAKE_KEY_ID', secretKey: 'FAKE_SECRET', feed: 'iex', mode: 'paper' }))
      if (saved.ok) {
        expect((await ds()).liveAvailable).toBe(true)
        const rolled = await set('live')
        expect(rolled.ok).toBe(false)                 // Alpaca rejected the fake creds
        expect((await ds()).source).toBe('simulator') // never left the prior source
      } else {
        console.log('[feed-switch] safeStorage unavailable — skipped the rollback sub-test')
      }

      expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([])
    } finally {
      if (app) { try { await app.close() } catch { /* ignore */ } }
      try { rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  })
})
