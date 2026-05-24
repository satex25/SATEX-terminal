import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useDataSourceStore } from './dataSourceStore'

beforeEach(() => {
  useDataSourceStore.setState({ source: 'simulator', liveAvailable: true, switching: false })
})
afterEach(() => vi.unstubAllGlobals())

describe('dataSourceStore.setSource', () => {
  it('no-ops when already on the target (no IPC call)', async () => {
    const setDataSource = vi.fn()
    vi.stubGlobal('window', { satex: { setDataSource } })
    const res = await useDataSourceStore.getState().setSource('simulator')
    expect(res.ok).toBe(true)
    expect(setDataSource).not.toHaveBeenCalled()
  })

  it('calls IPC and adopts the returned source on success', async () => {
    vi.stubGlobal('window', { satex: { setDataSource: vi.fn().mockResolvedValue({ ok: true, source: 'live' }) } })
    const res = await useDataSourceStore.getState().setSource('live')
    expect(res.ok).toBe(true)
    expect(useDataSourceStore.getState().source).toBe('live')
    expect(useDataSourceStore.getState().switching).toBe(false)
  })

  it('stays on the prior source + clears switching on refusal', async () => {
    vi.stubGlobal('window', { satex: { setDataSource: vi.fn().mockResolvedValue({ ok: false, reason: 'blocked' }) } })
    const res = await useDataSourceStore.getState().setSource('live')
    expect(res).toEqual({ ok: false, reason: 'blocked' })
    expect(useDataSourceStore.getState().source).toBe('simulator')
    expect(useDataSourceStore.getState().switching).toBe(false)
  })
})
