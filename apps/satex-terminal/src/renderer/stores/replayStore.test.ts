/**
 * replayStore contract tests (P-053).
 *
 * Pins the `active` derivation App.tsx branches its center column on:
 * playing/paused ⇒ active, idle/recording ⇒ inactive. A silent regression
 * here flips the whole Replay workspace on or off. Store source unchanged.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useReplayStore } from './replayStore'
import type { ReplayStatus } from '@shared/types'

function makeStatus(mode: ReplayStatus['mode']): ReplayStatus {
  return {
    mode,
    sessionId: mode === 'idle' ? null : 'sess-1',
    speed: 1,
    cursorTs: null,
    tapeStartTs: null,
    tapeEndTs: null,
    progress: null,
    emittedTicks: 0,
    bookmarks: [],
    autoPausedReason: null,
  }
}

beforeEach(() => {
  useReplayStore.setState({ status: null, active: false })
})

describe('replayStore', () => {
  it('starts inactive with no status', () => {
    const s = useReplayStore.getState()
    expect(s.status).toBeNull()
    expect(s.active).toBe(false)
  })

  it('derives active=true from playing', () => {
    useReplayStore.getState().setStatus(makeStatus('playing'))
    expect(useReplayStore.getState().active).toBe(true)
  })

  it('derives active=true from paused (session still open)', () => {
    useReplayStore.getState().setStatus(makeStatus('paused'))
    expect(useReplayStore.getState().active).toBe(true)
  })

  it('derives active=false from idle and recording', () => {
    useReplayStore.getState().setStatus(makeStatus('recording'))
    expect(useReplayStore.getState().active).toBe(false)
    useReplayStore.getState().setStatus(makeStatus('idle'))
    expect(useReplayStore.getState().active).toBe(false)
  })

  it('stores the exact pushed status object', () => {
    const status = makeStatus('playing')
    useReplayStore.getState().setStatus(status)
    expect(useReplayStore.getState().status).toBe(status)
  })
})
