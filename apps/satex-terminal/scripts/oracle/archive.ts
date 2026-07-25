/**
 * SATEX-RS oracle — golden archive writer.
 *
 * RS-UP-1 / RS-1.3 slice 3. Appendix A.1 makes the archive the unit of
 * evidence: "golden SHA + corpus SHA + engine SHA fully determine a run". A
 * golden file alone records what the engine did; the manifest beside it
 * records which corpus it ran over and under which capture parameters, so a
 * drift report can cite something an auditor could reproduce. RS-L4 is blunt
 * about the alternative — a parity claim without an archived report is not a
 * claim.
 *
 * The writer refuses two artifacts on principle. An **empty golden** would
 * make every future comparison trivially pass. An **incomplete run** — one
 * that hit the driver's stall budget instead of the end of the tape — is
 * worse, because it is structurally indistinguishable from a good capture and
 * would be cited as a reference forever. Both are the P-097 false-green shape:
 * a green result that measured nothing.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { GoldenStream } from './golden'

/** Schema tag for the manifest. Bump when a field's meaning changes. */
export const GOLDEN_ARCHIVE_SCHEMA = 'satex.oracle.golden/1'

/** Capture parameters that determine the golden's bytes. */
export interface CaptureParameters {
  speed: number
  stepMs: number
  checkpointEvery: number
  rngSeed: number
}

/** Provenance written next to every archived golden. */
export interface GoldenManifest {
  schema: string
  sessionId: string
  /** SHA-256 of the golden file's bytes. */
  goldenSha256: string
  records: number
  emittedTicks: number
  replayEndReason: string
  corpusFile: string
  corpusSha256: string
  capture: CaptureParameters
  /** What the sandbox refused, and whether anything sought authorization. */
  attestation: {
    networkAttemptsBlocked: readonly string[]
    dialogsAnswered: number
  }
}

/** The subset of a {@link import('./capture').CaptureSummary} an archive needs. */
export interface ArchivableSummary {
  sessionId: string
  goldenHash: string
  records: number
  emittedTicks: number
  replayEndReason: string | null
  networkAttempts: readonly string[]
  dialogs: readonly string[]
}

export interface WriteArchiveOptions {
  /** Directory to write into. Created if absent. */
  dir: string
  stream: GoldenStream
  summary: ArchivableSummary
  corpus: { file: string; sha256: string }
  capture: CaptureParameters
}

export interface WriteArchiveResult {
  goldenPath: string
  manifestPath: string
  manifest: GoldenManifest
}

/**
 * Writes `<session>.golden.jsonl` and `<session>.manifest.json`.
 *
 * The golden is written as the exact text the stream hashed, so the file on
 * disk and the value in the manifest are the same bytes by construction rather
 * than by convention.
 */
export function writeGoldenArchive(opts: WriteArchiveOptions): WriteArchiveResult {
  const { dir, stream, summary, corpus, capture } = opts

  if (stream.length === 0 || summary.records === 0) {
    throw new Error(
      'oracle archive: refusing to write an empty golden — every future comparison against it would pass vacuously (P-097 class)',
    )
  }
  if (summary.replayEndReason !== 'end-of-tape') {
    throw new Error(
      `oracle archive: refusing to archive an incomplete run (ended "${String(summary.replayEndReason)}", expected "end-of-tape") — ` +
      'a short golden is indistinguishable from a good one once it is on disk',
    )
  }

  fs.mkdirSync(dir, { recursive: true })
  const goldenPath = path.join(dir, `${summary.sessionId}.golden.jsonl`)
  const manifestPath = path.join(dir, `${summary.sessionId}.manifest.json`)

  const text = stream.text()
  // Explicit utf8, no BOM, LF endings already baked into `text()`. Writing the
  // string rather than re-serializing keeps the archived bytes identical to
  // the hashed bytes on every platform.
  fs.writeFileSync(goldenPath, text, { encoding: 'utf8' })

  const goldenSha256 = createHash('sha256').update(fs.readFileSync(goldenPath)).digest('hex')

  const manifest: GoldenManifest = {
    schema: GOLDEN_ARCHIVE_SCHEMA,
    sessionId: summary.sessionId,
    goldenSha256,
    records: summary.records,
    emittedTicks: summary.emittedTicks,
    replayEndReason: summary.replayEndReason,
    corpusFile: corpus.file,
    corpusSha256: corpus.sha256,
    capture,
    attestation: {
      networkAttemptsBlocked: [...summary.networkAttempts],
      dialogsAnswered: summary.dialogs.length,
    },
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8' })

  return { goldenPath, manifestPath, manifest }
}
