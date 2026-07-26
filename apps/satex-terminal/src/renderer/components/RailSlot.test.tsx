// @vitest-environment jsdom
/**
 * SATEX — RailSlot characterization suite (P-134 leaf-component jsdom wave).
 *
 * Fully-collapsible side-rail wrapper (view state only, routes no order). Pins
 * the two visual states (collapsed handle vs expanded slot), the per-orientation
 * glyphs, the aria-labels, the onToggle wiring in both states, and that children
 * render only when expanded. Subject RailSlot.tsx READ-ONLY (byte-unchanged).
 */
import { describe, it, expect, vi } from 'vitest'
import { act, createElement, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { RailSlot } from './RailSlot'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

function mount(props: ComponentProps<typeof RailSlot>) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(createElement(RailSlot, props)) })
  return { container, unmount: () => { act(() => { root.unmount() }); container.remove() } }
}

const base = {
  title: 'Depth',
  children: createElement('div', { className: 'payload' }, 'BODY'),
}

describe('RailSlot — expanded state', () => {
  it('renders the slot, the body children, and a collapse button', () => {
    const onToggle = vi.fn()
    const { container, unmount } = mount({ ...base, orientation: 'col', collapsed: false, onToggle })
    expect(container.querySelector('.bb-rail-slot--col')).not.toBeNull()
    expect(container.querySelector('.payload')!.textContent).toBe('BODY')
    const btn = container.querySelector('.bb-rail-collapse-btn') as HTMLButtonElement
    expect(btn.getAttribute('aria-label')).toBe('Collapse Depth')
    expect(btn.textContent).toBe('›') // › for col
    act(() => { btn.click() })
    expect(onToggle).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('uses the row-orientation collapse glyph', () => {
    const { container, unmount } = mount({ ...base, orientation: 'row', collapsed: false, onToggle: vi.fn() })
    expect((container.querySelector('.bb-rail-collapse-btn') as HTMLElement).textContent).toBe('▾') // ▾
    unmount()
  })
})

describe('RailSlot — collapsed state', () => {
  it('renders a re-open handle (no body) with the expand aria-label and col glyph', () => {
    const onToggle = vi.fn()
    const { container, unmount } = mount({ ...base, orientation: 'col', collapsed: true, onToggle })
    const handle = container.querySelector('.bb-rail-handle--col') as HTMLButtonElement
    expect(handle).not.toBeNull()
    expect(handle.getAttribute('aria-label')).toBe('Expand Depth')
    expect(container.querySelector('.bb-rail-handle-glyph')!.textContent).toBe('‹') // ‹
    expect(container.querySelector('.bb-rail-handle-label')!.textContent).toBe('Depth')
    expect(container.querySelector('.payload')).toBeNull() // body hidden when collapsed
    act(() => { handle.click() })
    expect(onToggle).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('uses the row-orientation handle glyph', () => {
    const { container, unmount } = mount({ ...base, orientation: 'row', collapsed: true, onToggle: vi.fn() })
    expect(container.querySelector('.bb-rail-handle-glyph')!.textContent).toBe('▴') // ▴
    unmount()
  })
})
