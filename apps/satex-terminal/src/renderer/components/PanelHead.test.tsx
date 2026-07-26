// @vitest-environment jsdom
/**
 * SATEX — PanelHead characterization suite (P-134 leaf-component jsdom wave).
 *
 * Uniform Black Box panel header. Pins the title, the optional right-meta slot,
 * and the live-dot conditional. Subject PanelHead.tsx READ-ONLY (byte-unchanged).
 */
import { describe, it, expect } from 'vitest'
import { act, createElement, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { PanelHead } from './PanelHead'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

function mount(props: ComponentProps<typeof PanelHead>) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(createElement(PanelHead, props)) })
  return { container, unmount: () => { act(() => { root.unmount() }); container.remove() } }
}

describe('PanelHead', () => {
  it('renders the title text', () => {
    const { container, unmount } = mount({ title: 'DEPTH' })
    expect(container.querySelector('.bb-panel-title')!.textContent).toBe('DEPTH')
    unmount()
  })

  it('renders a right-meta node when provided', () => {
    const { container, unmount } = mount({ title: 'DEPTH', right: createElement('span', null, 'LIVE') })
    expect(container.querySelector('.bb-panel-meta')!.textContent).toBe('LIVE')
    unmount()
  })

  it('omits the live dot by default and renders it when live', () => {
    const off = mount({ title: 'X' })
    expect(off.container.querySelector('.bb-panel-live-dot')).toBeNull()
    off.unmount()
    const on = mount({ title: 'X', live: true })
    expect(on.container.querySelector('.bb-panel-live-dot')).not.toBeNull()
    on.unmount()
  })
})
