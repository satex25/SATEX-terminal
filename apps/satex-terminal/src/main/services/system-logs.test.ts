/**
 * SATEX — SystemLogsService tests (coverage sweep, 2026-07-03 · P-077).
 *
 * New-file-only suite. Source (`system-logs.ts`) is byte-for-byte unchanged.
 * Pins the ring-buffer tail service that feeds the renderer SystemLogsPanel:
 * the ingest→SystemLogEntry mapping, level classification (EVENT tags +
 * normalizeLevel), `getTail` windowing (default 6 / custom n / empty), the
 * bounded ring buffer (`BUFFER_SIZE=60`, the same unbounded-writer class as
 * P-069's Observer flood), and — the point of the suite — the `onTail`
 * broadcast + unsubscribe contract (the PR#6 / P-041 / P-043 / P-046 listener-
 * leak class). Pure in-memory: no electron, no timers.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SystemLogsService } from './system-logs'
import type { LogEntry, LogLevel } from './logger'

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return { ts: 1, level: 'info', ns: 'algo', msg: 'hello', ...overrides }
}

describe('SystemLogsService', () => {
  let svc: SystemLogsService

  beforeEach(() => {
    svc = new SystemLogsService()
  })

  describe('ingest → getTail mapping', () => {
    it('maps a logger entry to a SystemLogEntry (ts / level / tag / msg)', () => {
      svc.ingest(entry({ ts: 42, level: 'info', ns: 'risk', msg: 'ok' }))
      const tail = svc.getTail()
      expect(tail.lines).toHaveLength(1)
      expect(tail.lines[0]).toEqual({ ts: 42, level: 'INFO', tag: 'risk', msg: 'ok' })
    })

    it('returns an empty tail before any ingest', () => {
      expect(svc.getTail()).toEqual({ lines: [] })
    })
  })

  describe('getTail windowing', () => {
    it('defaults to the last 6 entries (TAIL_SIZE), latest last', () => {
      for (let i = 0; i < 10; i++) svc.ingest(entry({ ts: i, msg: `m${i}` }))
      const tail = svc.getTail()
      expect(tail.lines).toHaveLength(6)
      expect(tail.lines.map((l) => l.ts)).toEqual([4, 5, 6, 7, 8, 9])
    })

    it('honors a custom n', () => {
      for (let i = 0; i < 10; i++) svc.ingest(entry({ ts: i }))
      expect(svc.getTail(3).lines.map((l) => l.ts)).toEqual([7, 8, 9])
    })
  })

  describe('ring buffer — bounded growth (BUFFER_SIZE=60)', () => {
    it('never retains more than 60 entries, keeping the most recent', () => {
      for (let i = 0; i < 100; i++) svc.ingest(entry({ ts: i }))
      const all = svc.getTail(1000) // ask for far more than the cap
      expect(all.lines).toHaveLength(60)
      expect(all.lines[0]!.ts).toBe(40) // oldest survivor = 100 - 60
      expect(all.lines[all.lines.length - 1]!.ts).toBe(99) // newest
    })
  })

  describe('level classification', () => {
    it('classifies EVENT_TAG namespaces as EVENT', () => {
      for (const ns of ['cat', 'event', 'autonomous', 'replay']) {
        const s = new SystemLogsService()
        s.ingest(entry({ ns, level: 'info' }))
        expect(s.getTail().lines[0]!.level).toBe('EVENT')
      }
    })

    it('normalizes non-event levels to their uppercase form', () => {
      const cases: Array<[LogLevel, string]> = [
        ['error', 'ERROR'],
        ['warn', 'WARN'],
        ['info', 'INFO'],
        ['debug', 'DEBUG'],
        ['trace', 'TRACE'],
      ]
      for (const [lvl, expected] of cases) {
        const s = new SystemLogsService()
        s.ingest(entry({ ns: 'algo', level: lvl }))
        expect(s.getTail().lines[0]!.level).toBe(expected)
      }
    })
  })

  describe('onTail — broadcast + unsubscribe (leak class)', () => {
    it('broadcasts the current tail to subscribers on every ingest', () => {
      const fn = vi.fn()
      svc.onTail(fn)
      svc.ingest(entry({ ts: 7, msg: 'live' }))
      expect(fn).toHaveBeenCalledTimes(1)
      const tail = fn.mock.calls[0]![0]
      expect(tail.lines[tail.lines.length - 1]).toMatchObject({ ts: 7, msg: 'live' })
    })

    it('unsubscribe removes the listener — no further broadcasts after off()', () => {
      const fn = vi.fn()
      const off = svc.onTail(fn)
      svc.ingest(entry())
      expect(fn).toHaveBeenCalledTimes(1)

      off()
      svc.ingest(entry())
      expect(fn).toHaveBeenCalledTimes(1) // frozen: no leak
    })
  })
})
