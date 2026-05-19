/**
 * SATEX — Update store tests (S1-9, v0.4.3).
 *
 * Pins the renderer-side state machine that drives the UpdateToast component.
 * No jsdom / React Testing Library — vitest config (vitest.config.ts) only
 * picks up *.test.ts and runs in the default node env. The store itself is
 * a pure Zustand atom; testing setAvailable/setShow against state mutations
 * proves the contract the toast component reads from.
 *
 * Wiring tests (window.satex.onUpdateAvailable → setAvailable) live in the
 * useIPC integration shape — exercised at Phase 0 by reading the file and
 * verifying the unsub callback is registered alongside the other push subs.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useUpdateStore } from './update-store'

function reset(): void {
  // Zustand stores are singletons across tests within a vitest worker. Manually
  // reset to the initial INITIAL shape so each test starts clean.
  useUpdateStore.setState({
    available: false,
    version: undefined,
    downloaded: false,
    show: false,
  })
}

beforeEach(reset)

describe('useUpdateStore — initial state', () => {
  it('boots disarmed — no toast, no version, nothing downloaded', () => {
    const s = useUpdateStore.getState()
    expect(s.available).toBe(false)
    expect(s.downloaded).toBe(false)
    expect(s.show).toBe(false)
    expect(s.version).toBeUndefined()
  })
})

describe('useUpdateStore — setAvailable transitions', () => {
  it('flips show to true the first time availability turns on (update-available push)', () => {
    useUpdateStore.getState().setAvailable({ available: true, version: '0.4.4', downloaded: false })
    const s = useUpdateStore.getState()
    expect(s.available).toBe(true)
    expect(s.version).toBe('0.4.4')
    expect(s.downloaded).toBe(false)
    expect(s.show).toBe(true)
  })

  it('preserves the user dismissal when update-downloaded fires after a Remind Me Later', () => {
    // update-available → toast appears
    useUpdateStore.getState().setAvailable({ available: true, version: '0.4.4', downloaded: false })
    // user clicks Remind Me Later
    useUpdateStore.getState().setShow(false)
    expect(useUpdateStore.getState().show).toBe(false)
    // update-downloaded re-pushes — toast should stay hidden (user already dismissed),
    // but downloaded flips so a subsequent re-open would have an enabled button.
    useUpdateStore.getState().setAvailable({ available: true, version: '0.4.4', downloaded: true })
    const s = useUpdateStore.getState()
    expect(s.downloaded).toBe(true)
    expect(s.show).toBe(false) // dismissal sticks
  })

  it('does not re-trigger show when available is already true and the push repeats', () => {
    // First push opens the toast
    useUpdateStore.getState().setAvailable({ available: true, version: '0.4.4', downloaded: false })
    // A duplicate available=true push (e.g. update-downloaded retrigger) should
    // not flap show off-then-on; show stays whatever it was.
    useUpdateStore.getState().setAvailable({ available: true, version: '0.4.4', downloaded: true })
    expect(useUpdateStore.getState().show).toBe(true)
    expect(useUpdateStore.getState().downloaded).toBe(true)
  })

  it('handles update-not-available (engine reports no upgrade pending)', () => {
    useUpdateStore.getState().setAvailable({ available: false, downloaded: false })
    const s = useUpdateStore.getState()
    expect(s.available).toBe(false)
    expect(s.show).toBe(false)
  })
})

describe('useUpdateStore — setShow', () => {
  it('hides the toast without dropping availability', () => {
    useUpdateStore.getState().setAvailable({ available: true, version: '0.4.4', downloaded: true })
    useUpdateStore.getState().setShow(false)
    const s = useUpdateStore.getState()
    expect(s.show).toBe(false)
    expect(s.available).toBe(true) // engine still tracks the pending update
    expect(s.downloaded).toBe(true)
  })

  it('show=true on a stale store does not synthesize fake availability', () => {
    useUpdateStore.getState().setShow(true)
    const s = useUpdateStore.getState()
    expect(s.show).toBe(true)
    expect(s.available).toBe(false) // setShow doesn't fabricate state
  })
})

describe('useUpdateStore — full S1-9 lifecycle', () => {
  it('walks update-available → update-downloaded → user clicks → reset', () => {
    // 1. Engine reports update available, download starts in the main process.
    useUpdateStore.getState().setAvailable({ available: true, version: '0.4.4', downloaded: false })
    expect(useUpdateStore.getState().show).toBe(true)
    expect(useUpdateStore.getState().downloaded).toBe(false) // button still disabled

    // 2. Engine reports download finished — same channel, downloaded:true.
    useUpdateStore.getState().setAvailable({ available: true, version: '0.4.4', downloaded: true })
    expect(useUpdateStore.getState().downloaded).toBe(true) // button enables now

    // 3. User clicks Restart Now → toast handler calls window.satex.installUpdate()
    //    (out of scope for the store; covered by the preload index test).
    //    The toast component will not unmount on its own — the app will exit
    //    via quitAndInstall. Simulate dismissal explicitly to close the loop.
    useUpdateStore.getState().setShow(false)
    expect(useUpdateStore.getState().show).toBe(false)
  })
})
