/**
 * SATEX — System Logs Tail Service (Phase 10 · Black Box)
 *
 * Wraps the existing structured logger with a ring buffer of recent entries.
 * The renderer's SystemLogsPanel subscribes to LOGS_TAIL push for live "last 6s"
 * style tail — this is the only renderer-side consumer of log events.
 *
 * Wire-up: register `ingest` as the logger's push callback in main/index.ts
 * BEFORE the engine initializes so we don't miss boot-time entries.
 */
import type { SystemLogEntry, SystemLogsTail } from '@shared/types'
import type { LogEntry as MainLogEntry, LogLevel as MainLogLevel } from './logger'

export type LogsTailListener = (tail: SystemLogsTail) => void

const TAIL_SIZE   = 6      // matches Black Box SystemLogs panel (6 visible rows)
const BUFFER_SIZE = 60     // ring buffer cap — last ~60s at ~1 row/s

function normalizeLevel(lvl: MainLogLevel): SystemLogEntry['level'] {
  switch (lvl) {
    case 'error': return 'ERROR'
    case 'warn':  return 'WARN'
    case 'info':  return 'INFO'
    case 'debug': return 'DEBUG'
    case 'trace': return 'TRACE'
    default:      return 'INFO'
  }
}

/** Mark a logger entry as an EVENT (more prominent than INFO).
 *  Currently emitted by trading-engine for catalyst-class messages. */
const EVENT_TAGS = new Set(['cat', 'event', 'autonomous', 'replay'])

function classify(entry: MainLogEntry): SystemLogEntry['level'] {
  if (EVENT_TAGS.has(entry.ns)) return 'EVENT'
  return normalizeLevel(entry.level)
}

export class SystemLogsService {
  private buffer: SystemLogEntry[] = []
  private listeners: Set<LogsTailListener> = new Set()

  /** Hook for the main-process logger to push every entry through. */
  ingest = (entry: MainLogEntry): void => {
    const out: SystemLogEntry = {
      ts:    entry.ts,
      level: classify(entry),
      tag:   entry.ns,
      msg:   entry.msg,
    }
    this.buffer.push(out)
    if (this.buffer.length > BUFFER_SIZE) {
      this.buffer.splice(0, this.buffer.length - BUFFER_SIZE)
    }
    this.broadcast()
  }

  getTail(n = TAIL_SIZE): SystemLogsTail {
    return { lines: this.buffer.slice(-n) }
  }

  onTail(fn: LogsTailListener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private broadcast(): void {
    const tail = this.getTail()
    for (const fn of this.listeners) fn(tail)
  }
}
