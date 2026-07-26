// @vitest-environment jsdom
/**
 * SATEX — SessionPill characterization suite (P-134 leaf-component jsdom wave).
 *
 * Liquidity-session badge. Pins the per-session glyph map, the session name,
 * and the SESSION suffix. Subject SessionPill.tsx READ-ONLY (byte-unchanged).
 */
import { describe, it, expect } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { SessionPill } from './SessionPill'
import type { SessionId } from '@shared/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

function mount(session: SessionId) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(createElement(SessionPill, { session })) })
  return { container, unmount: () => { act(() => { root.unmount() }); container.remove() } }
}

describe('SessionPill', () => {
  it.each([
    ['TOKYO', '◐'],
    ['LONDON', '◑'],
    ['NY', '◔'],
  ] as const)('renders the %s glyph, name, and SESSION suffix', (session, glyph) => {
    const { container, unmount } = mount(session)
    expect(container.querySelector('.bb-session-icon')!.textContent).toBe(glyph)
    expect(container.querySelector('.bb-session-name')!.textContent).toBe(session)
    expect(container.querySelector('.bb-session-suffix')!.textContent).toBe('SESSION')
    unmount()
  })
})
