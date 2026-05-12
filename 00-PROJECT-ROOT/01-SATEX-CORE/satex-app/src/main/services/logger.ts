/**
 * SATEX — Structured Logger
 * Lightweight structured logger for the main process.
 * Outputs JSON-structured lines to stdout; renderer receives LOG_EVENT push.
 */

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error'

const LEVELS: Record<LogLevel, number> = { trace: 0, debug: 1, info: 2, warn: 3, error: 4 }

let minLevel: number = LEVELS.info
let pushFn: ((entry: LogEntry) => void) | null = null

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

function emit(level: LogLevel, ns: string, msg: string, data?: Record<string, unknown>): void {
  if ((LEVELS[level] ?? 0) < minLevel) return
  const entry: LogEntry = { ts: Date.now(), level, ns, msg, ...(data ? { data } : {}) }
  const line = JSON.stringify(entry)
  if (level === 'error' || level === 'warn') {
    process.stderr.write(line + '\n')
  } else {
    process.stdout.write(line + '\n')
  }
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
