/**
 * RS-1.3 slice 2 — corpus→scratch-DB importer contract.
 *
 * The importer materializes a corpus tape into the sandbox database so
 * `ReplaySource` can stream it back. Its real job is not the INSERT — it is
 * refusing to *look* like it worked when it did not.
 *
 * `persistence.ts` falls back to a `NullDB` whose `run()` reports zero changes,
 * whose `all()` returns `[]`, and which throws nothing at all. Under that
 * store the importer would write 35,658 rows, report 35,658 rows written
 * (`insertTickBatch` returns `rows.length` regardless), and hand back a tape
 * the replay source would find empty — a golden of zero records that passes
 * every structural check. That is the P-097 false-green class exactly, and it
 * is the failure this suite exists to make impossible.
 *
 * Harness note: `openDB()` resolves better-sqlite3 through a bare
 * `require('better-sqlite3')`, which under vitest's ESM transform reaches
 * global scope — hence the `createRequire` shim, mirroring
 * `persistence.test.ts`. If the native module cannot load, the assertions
 * below fail loudly rather than degrading to NullDB silently.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createSandbox, type OracleSandbox } from './sandbox'
import { synthesizeTape } from './corpus'
import { importCorpusTape, type PersistenceApi } from './importer'
import { sandboxDbPath } from './electron-stub'

const ctx = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      const p = `${ctx.root}/${name}`
      fs.mkdirSync(p, { recursive: true })
      return p
    },
    getAppPath: () => ctx.root,
  },
}))

const nodeRequire = createRequire(import.meta.url)
vi.stubGlobal('require', (id: string) => {
  const override = process.env['SATEX_TEST_BETTER_SQLITE3']
  if (id === 'better-sqlite3' && override) return nodeRequire(override)
  return nodeRequire(id)
})

let sb: OracleSandbox

beforeEach(() => {
  sb = createSandbox()
  ctx.root = sb.root
  vi.resetModules()
})
afterEach(async () => {
  // Release the sqlite handle before removing the tree — Windows refuses to
  // delete a directory holding an open file.
  try { (await persistence()).closeDB() } catch { /* never opened */ }
  sb.dispose()
})

async function persistence(): Promise<typeof import('../../src/main/services/persistence')> {
  return import('../../src/main/services/persistence')
}

const TAPE = (): ReturnType<typeof synthesizeTape> => synthesizeTape({
  sessionId: 'ses_import00000001',
  symbols: ['AAPL', 'MSFT'],
  ticksPerSymbol: 25,
  startTs: 1_784_880_000_000,
  stepMs: 250,
})

describe('importCorpusTape', () => {
  it('writes every row and reads the same count back out of the database', async () => {
    const db = await persistence()
    const tape = TAPE()
    const res = importCorpusTape(tape, db, { dbFile: sandboxDbPath(sb) })
    expect(res.rowsWritten).toBe(50)
    // Read-back, not the writer's own return value: this is the assertion a
    // NullDB cannot satisfy.
    expect(res.bounds.count).toBe(50)
    expect(res.bounds.firstTs).toBe(tape.header.firstTs)
    expect(res.bounds.lastTs).toBe(tape.header.lastTs)
  })

  it('leaves a real SQLite file on disk', async () => {
    const db = await persistence()
    importCorpusTape(TAPE(), db, { dbFile: sandboxDbPath(sb) })
    const header = fs.readFileSync(sandboxDbPath(sb)).subarray(0, 15).toString('utf8')
    expect(header).toBe('SQLite format 3')
  })

  it('registers the session so listReplayableSessions can find the tape', async () => {
    const db = await persistence()
    const tape = TAPE()
    importCorpusTape(tape, db, { dbFile: sandboxDbPath(sb) })
    const sessions = db.listReplayableSessions(10)
    expect(sessions.map(s => s.sessionId)).toContain(tape.header.sessionId)
  })

  it('seals a manifest that ReplaySource verifies as ok, not no-manifest', async () => {
    const db = await persistence()
    const tape = TAPE()
    const res = importCorpusTape(tape, db, { dbFile: sandboxDbPath(sb) })
    const stored = db.getTapeManifest(tape.header.sessionId)
    expect(stored).not.toBeNull()
    expect(stored!.manifestHash).toBe(res.manifestHash)
    // Sealing against the *imported* bounds is what turns the replay's
    // open-time integrity check from a `no-manifest` warning into `ok`.
    expect(stored!.tickCount).toBe(50)
    expect(stored!.firstTs).toBe(tape.header.firstTs)
    expect(stored!.lastTs).toBe(tape.header.lastTs)
  })

  it('reports agreement with the manifest hash the recording sealed', async () => {
    const db = await persistence()
    const tape = TAPE()
    const withManifest = {
      ...tape,
      header: {
        ...tape.header,
        liveTapeManifest: {
          // Hash over the same four fields the import will seal — this is what
          // a faithful import must reproduce.
          manifestHash: importCorpusTape(tape, db, { dbFile: sandboxDbPath(sb) }).manifestHash,
          tickCount: tape.header.tickCount,
          firstTs: tape.header.firstTs,
          lastTs: tape.header.lastTs,
          sealedAt: 0,
        },
      },
    }
    const res = importCorpusTape(withManifest, db, { dbFile: sandboxDbPath(sb) })
    expect(res.manifestMatchedRecording).toBe(true)
  })

  it('flags a tape whose recorded manifest hash does not match what was imported', async () => {
    const db = await persistence()
    const tape = TAPE()
    const tampered = {
      ...tape,
      header: {
        ...tape.header,
        liveTapeManifest: { manifestHash: 'deadbeef', tickCount: 50, firstTs: tape.header.firstTs, lastTs: tape.header.lastTs, sealedAt: 0 },
      },
    }
    expect(() => importCorpusTape(tampered, db, { dbFile: sandboxDbPath(sb) })).toThrow(/manifest/i)
  })

  it('refuses a store that accepts writes but reads back nothing — the P-097 law', async () => {
    // A NullDB-shaped store: writes "succeed", reads are empty. This is the
    // exact degradation persistence.ts falls into when better-sqlite3 will not
    // load, and the importer must reject it rather than emit an empty golden.
    const nullish: PersistenceApi = {
      insertSession: () => {},
      insertTickBatch: (rows) => rows.length,
      getTapeBounds: () => ({ firstTs: null, lastTs: null, count: 0 }),
      upsertTapeManifest: () => {},
      getTapeManifest: () => null,
    }
    expect(() => importCorpusTape(TAPE(), nullish, { dbFile: sandboxDbPath(sb) }))
      .toThrow(/read back|NullDB|no-op/i)
  })

  it('refuses when the database file is not a real SQLite file', async () => {
    const db = await persistence()
    const bogus = path.join(sb.path('userData'), 'not-a-db.sqlite')
    fs.writeFileSync(bogus, 'this is not a database')
    expect(() => importCorpusTape(TAPE(), db, { dbFile: bogus })).toThrow(/SQLite/i)
  })
})
