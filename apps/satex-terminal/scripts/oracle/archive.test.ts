/**
 * RS-1.3 slice 3 — golden archive contract.
 *
 * Appendix A.1 makes the archive the unit of evidence: "golden SHA + corpus
 * SHA + engine SHA fully determine a run". A golden file on its own says what
 * the engine did; the manifest beside it says *which* engine, over *which*
 * corpus, under *which* capture parameters — without that, a parity report has
 * nothing to cite, and RS-L4 says a parity claim without an archived report is
 * not a claim.
 */
import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { writeGoldenArchive, GOLDEN_ARCHIVE_SCHEMA, type GoldenManifest } from './archive'
import { GoldenStream } from './golden'

const temps: string[] = []
afterEach(() => { while (temps.length > 0) fs.rmSync(temps.pop()!, { recursive: true, force: true }) })

function tempDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'satex-archive-test-'))
  temps.push(d)
  return d
}

function streamOf(n: number): GoldenStream {
  const s = new GoldenStream()
  for (let i = 0; i < n; i++) s.emit({ tickIndex: i, ts: 1_000 + i, level: 'L1', kind: 'test.record', payload: { i } })
  return s
}

const SUMMARY = {
  sessionId: 'ses_archive000001',
  records: 3,
  emittedTicks: 42,
  replayEndReason: 'end-of-tape',
  networkAttempts: ['https://www.sec.gov/files/company_tickers.json'],
  dialogs: [] as readonly string[],
}

describe('writeGoldenArchive', () => {
  it('writes the golden stream verbatim, LF-terminated', () => {
    const dir = tempDir()
    const stream = streamOf(3)
    const { goldenPath } = writeGoldenArchive({
      dir, stream, summary: { ...SUMMARY, goldenHash: stream.hash() },
      corpus: { file: 'tape-x.jsonl', sha256: 'abc' },
      capture: { speed: 10, stepMs: 1000, checkpointEvery: 4, rngSeed: 20260725 },
    })
    // Byte-for-byte the text the hash was taken over — an archive that
    // reformats its own evidence is not evidence.
    expect(fs.readFileSync(goldenPath, 'utf8')).toBe(stream.text())
  })

  it('records the golden hash the file actually hashes to', () => {
    const dir = tempDir()
    const stream = streamOf(5)
    const { goldenPath, manifestPath } = writeGoldenArchive({
      dir, stream, summary: { ...SUMMARY, goldenHash: stream.hash() },
      corpus: { file: 'tape-x.jsonl', sha256: 'abc' },
      capture: { speed: 10, stepMs: 1000, checkpointEvery: 4, rngSeed: 20260725 },
    })
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as GoldenManifest
    // Recompute from the bytes on disk rather than trusting the summary.
    const onDisk = fs.readFileSync(goldenPath)
    expect(createHash('sha256').update(onDisk).digest('hex')).toBe(manifest.goldenSha256)
  })

  it('carries the corpus identity a parity claim has to cite', () => {
    const dir = tempDir()
    const stream = streamOf(2)
    const { manifestPath } = writeGoldenArchive({
      dir, stream, summary: { ...SUMMARY, goldenHash: stream.hash() },
      corpus: { file: 'tape-ses_mrynz0vlkf0x001.jsonl', sha256: '1a202d2f' },
      capture: { speed: 10, stepMs: 1000, checkpointEvery: 4, rngSeed: 20260725 },
    })
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as GoldenManifest
    expect(m.schema).toBe(GOLDEN_ARCHIVE_SCHEMA)
    expect(m.corpusFile).toBe('tape-ses_mrynz0vlkf0x001.jsonl')
    expect(m.corpusSha256).toBe('1a202d2f')
    expect(m.capture).toEqual({ speed: 10, stepMs: 1000, checkpointEvery: 4, rngSeed: 20260725 })
  })

  it('carries the attestation — what was blocked and what was authorized', () => {
    const dir = tempDir()
    const stream = streamOf(2)
    const { manifestPath } = writeGoldenArchive({
      dir, stream, summary: { ...SUMMARY, goldenHash: stream.hash() },
      corpus: { file: 'tape-x.jsonl', sha256: 'abc' },
      capture: { speed: 10, stepMs: 1000, checkpointEvery: 4, rngSeed: 20260725 },
    })
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as GoldenManifest
    expect(m.attestation.dialogsAnswered).toBe(0)
    expect(m.attestation.networkAttemptsBlocked).toEqual(['https://www.sec.gov/files/company_tickers.json'])
  })

  it('refuses to archive a run that did not reach the end of its tape', () => {
    const dir = tempDir()
    const stream = streamOf(2)
    // A short golden that looks structurally fine is the dangerous artifact:
    // it would be cited as a reference forever.
    expect(() => writeGoldenArchive({
      dir, stream,
      summary: { ...SUMMARY, goldenHash: stream.hash(), replayEndReason: 'budget-exhausted' },
      corpus: { file: 'tape-x.jsonl', sha256: 'abc' },
      capture: { speed: 10, stepMs: 1000, checkpointEvery: 4, rngSeed: 20260725 },
    })).toThrow(/end-of-tape|incomplete/i)
  })

  it('refuses to archive an empty golden', () => {
    const dir = tempDir()
    const stream = streamOf(0)
    expect(() => writeGoldenArchive({
      dir, stream, summary: { ...SUMMARY, goldenHash: stream.hash(), records: 0 },
      corpus: { file: 'tape-x.jsonl', sha256: 'abc' },
      capture: { speed: 10, stepMs: 1000, checkpointEvery: 4, rngSeed: 20260725 },
    })).toThrow(/empty|no records/i)
  })

  it('names files after the session so a corpus of many sessions stays legible', () => {
    const dir = tempDir()
    const stream = streamOf(2)
    const { goldenPath, manifestPath } = writeGoldenArchive({
      dir, stream, summary: { ...SUMMARY, goldenHash: stream.hash() },
      corpus: { file: 'tape-x.jsonl', sha256: 'abc' },
      capture: { speed: 10, stepMs: 1000, checkpointEvery: 4, rngSeed: 20260725 },
    })
    expect(path.basename(goldenPath)).toBe('ses_archive000001.golden.jsonl')
    expect(path.basename(manifestPath)).toBe('ses_archive000001.manifest.json')
  })
})
