/**
 * SATEX — System-logs tail store characterization coverage.
 *
 * Pins the LOGS_TAIL reducer: an empty default tail, and the setTail destructure
 * contract (`setTail({ lines })` → `tail = lines`, replace by reference).
 * Characterization test: a refactor that changed the payload shape or appended
 * instead of replacing would turn red.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { SystemLogEntry } from '@shared/types'
import { useLogsStore } from './logsStore'

function entry(msg: string): SystemLogEntry {
  return { ts: 1_700_000_000_000, level: 'INFO', tag: 'tape', msg }
}

beforeEach(() => {
  useLogsStore.setState(useLogsStore.getInitialState(), true)
})

describe('logsStore', () => {
  it('seeds an empty tail', () => {
    expect(useLogsStore.getState().tail).toEqual([])
  })

  it('setTail({ lines }) destructures lines into tail (exact array by reference)', () => {
    const lines = [entry('a'), entry('b')]
    useLogsStore.getState().setTail({ lines })
    expect(useLogsStore.getState().tail).toBe(lines)
  })

  it('setTail({ lines: [] }) clears the tail', () => {
    useLogsStore.getState().setTail({ lines: [entry('x')] })
    useLogsStore.getState().setTail({ lines: [] })
    expect(useLogsStore.getState().tail).toEqual([])
  })
})
