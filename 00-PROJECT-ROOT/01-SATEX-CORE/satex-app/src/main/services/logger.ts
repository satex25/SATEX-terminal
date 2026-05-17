/**
 * SATEX — Structured Logger
 * Lightweight structured logger for the main process.
 * Outputs JSON-structured lines to stdout. The renderer's SystemLogsPanel
 * consumes log entries via LOGS_TAIL (ring-buffered tail, see system-logs.ts).
 *
 * C17 / S1-7 — also persists to a daily rotating file under
 * `<userData>/logs/satex-YYYY-MM-DD.log`. WARN + ERROR always written; INFO
 * gated by the same min-level as stdout. Rotation: when the active file
 * exceeds FILE_SIZE_CAP_BYTES, it's renamed to `*.{seq}.log` and a fresh file
 * starts. Failures in the file sink are silent (stderr-logged once per day)
 * so a disk-full condition can't crash the trading engine.
 */
import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error'

const LEVELS: Record<LogLevel, number> = { trace: 0, debug: 1, info: 2, warn: 3, error: 4 }
const FILE_SIZE_CAP_BYTES = 10 * 1024 * 1024  // 10 MB before rotation
const MAX_ROTATIONS = 7                        // keep last 7 same-day rotations

let minLevel: number = LEVELS.info
let pushFn: ((entry: LogEntry) => void) | null = null
let fileSinkDir: string | null = null
let fileSinkFailedAt = 0  // throttle file-sink error logging to once per day

export interface LogEntry {
  ts: number
  level: LogLevel
  ns: string
  msg: string
  data?: Record<string, unknown>
}

export function configureLogger(level: LogLevel, push?: (e: LogEntry) => void): void {
  minLevel = LEVELS[level] ?? LEVELS.info
  if (push) pushFn = push
}

/** Enable file persistence. Called once from main/index.ts after app.getPath
 *  becomes available. Idempotent — re-calling with the same dir is a no-op,
 *  with a different dir rotates the active sink.
 *
 *  Emits three info-level log lines so the audit trail can always answer
 *  "what userData path did this process resolve, and did mkdir succeed?":
 *    1. file sink init starting    — resolved userDataDir + target
 *    2. file sink ready            — confirmation + created/existed flag
 *    3. (on failure) file sink init failed — stderr-direct, includes stack
 */
export function enableFileSink(userDataDir: string): void {
  // Bootstrap logger for this function only. Cannot rely on the caller's
  // logger being configured yet (configureLogger() typically runs after).
  const boot = createLogger('logger')
  if (!userDataDir) {
    boot.warn('enableFileSink called with empty userDataDir — file sink disabled')
    return
  }
  const target = join(userDataDir, 'logs')
  boot.info('file sink init starting', { userDataDir, target })
  try {
    const existedBefore = existsSync(target)
    mkdirSync(target, { recursive: true })
    // Verify post-condition: mkdirSync can return silently on some FS
    // races even when the dir wasn't actually created. existsSync after
    // proves we have what we asked for.
    if (!existsSync(target)) {
      throw new Error(`mkdirSync returned but directory still absent: ${target}`)
    }
    fileSinkDir = target
    boot.info('file sink ready', { dir: fileSinkDir, created: !existedBefore })
  } catch (e) {
    // Directory creation failure goes LOUD on stderr — without file logs,
    // post-crash forensics rely entirely on stdout/stderr capture, which
    // may be lost by the time someone investigates. Include the stack so
    // ENOENT-vs-EACCES-vs-EPERM is unambiguous.
    process.stderr.write(JSON.stringify({
      ts: Date.now(), level: 'error', ns: 'logger',
      msg: 'file sink init failed',
      data: { dir: target, err: String(e), stack: (e as Error)?.stack ?? null },
    }) + '\n')
    fileSinkDir = null
  }
}

function currentLogPath(): string | null {
  if (!fileSinkDir) return null
  const d = new Date()
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return join(fileSinkDir, `satex-${yyyy}-${mm}-${dd}.log`)
}

/** Pure rotation step extracted from `maybeRotate` for testability. After
 *  invocation:
 *    `${basePath}.1`      = the just-rotated current file (most recent)
 *    `${basePath}.{N}`    = oldest surviving rotation
 *    `${basePath}.{N+1}+` = dropped (would-be next slot's content discarded)
 *  The previous loop-then-recycle approach (find first empty slot 1..N, else
 *  overwrite slot 1) froze slots .2..N after the first N rotations because it
 *  always re-overwrote slot 1, leaving the higher slots holding only their
 *  initial contents forever. */
export function rotateSlots(opts: {
  exists: (path: string) => boolean
  rename: (from: string, to: string) => void
  remove: (path: string) => void
  basePath: string
  maxSlots: number
}): void {
  const { exists, rename, remove, basePath, maxSlots } = opts
  const oldest = `${basePath}.${maxSlots}`
  if (exists(oldest)) remove(oldest)
  for (let i = maxSlots - 1; i >= 1; i--) {
    const src = `${basePath}.${i}`
    const dst = `${basePath}.${i + 1}`
    if (exists(src)) rename(src, dst)
  }
  rename(basePath, `${basePath}.1`)
}

function maybeRotate(path: string): void {
  try {
    if (!existsSync(path)) return
    const size = statSync(path).size
    if (size < FILE_SIZE_CAP_BYTES) return
    rotateSlots({
      exists:   existsSync,
      rename:   renameSync,
      remove:   (p) => rmSync(p, { force: true }),
      basePath: path,
      maxSlots: MAX_ROTATIONS,
    })
  } catch (e) {
    const now = Date.now()
    if (now - fileSinkFailedAt > 24 * 60 * 60_000) {
      fileSinkFailedAt = now
      process.stderr.write(JSON.stringify({
        ts: now, level: 'warn', ns: 'logger', msg: 'log rotation failed',
        data: { path, err: String(e) },
      }) + '\n')
    }
  }
}

function writeToFile(line: string, level: LogLevel): void {
  // File sink mirrors what hits stdout: respect min-level. WARN + ERROR are
  // always persisted regardless of min-level so post-crash forensics never
  // miss them.
  const persistAnyway = level === 'warn' || level === 'error'
  if (!persistAnyway && (LEVELS[level] ?? 0) < minLevel) return
  const path = currentLogPath()
  if (!path) return
  try {
    maybeRotate(path)
    appendFileSync(path, line + '\n', 'utf8')
  } catch (e) {
    const now = Date.now()
    if (now - fileSinkFailedAt > 24 * 60 * 60_000) {
      fileSinkFailedAt = now
      process.stderr.write(JSON.stringify({
        ts: now, level: 'warn', ns: 'logger', msg: 'file sink write failed',
        data: { path, err: String(e) },
      }) + '\n')
    }
  }
}

function emit(level: LogLevel, ns: string, msg: string, data?: Record<string, unknown>): void {
  if ((LEVELS[level] ?? 0) < minLevel && level !== 'warn' && level !== 'error') return
  const entry: LogEntry = { ts: Date.now(), level, ns, msg, ...(data ? { data } : {}) }
  const line = JSON.stringify(entry)
  if (level === 'error' || level === 'warn') {
    process.stderr.write(line + '\n')
  } else if ((LEVELS[level] ?? 0) >= minLevel) {
    process.stdout.write(line + '\n')
  }
  writeToFile(line, level)
  pushFn?.(entry)
}

export interface Logger {
  trace(msg: string, data?: Record<string, unknown>): void
  debug(msg: string, data?: Record<string, unknown>): void
  info(msg: string, data?: Record<string, unknown>): void
  warn(msg: string, data?: Record<string, unknown>): void
  error(msg: string, data?: Record<string, unknown>): void
}

export function createLogger(ns: string): Logger {
  return {
    trace: (msg, data) => emit('trace', ns, msg, data),
    debug: (msg, data) => emit('debug', ns, msg, data),
    info:  (msg, data) => emit('info',  ns, msg, data),
    warn:  (msg, data) => emit('warn',  ns, msg, data),
    error: (msg, data) => emit('error', ns, msg, data),
  }
}
