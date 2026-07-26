// @vitest-environment jsdom
/**
 * SATEX — Icon characterization suite (P-134 leaf-component jsdom wave).
 *
 * Inline SVG icon set (stroke-based, currentColor). Pins the default size,
 * size override, the 24x24 viewBox, and that distinct names select distinct
 * path geometry. Subject Icon.tsx READ-ONLY (byte-unchanged).
 */
import { describe, it, expect } from 'vitest'
import { act, createElement, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { Icon } from './Icon'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

function mount(props: ComponentProps<typeof Icon>) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(createElement(Icon, props)) })
  return { container, unmount: () => { act(() => { root.unmount() }); container.remove() } }
}

describe('Icon', () => {
  it('renders a 24x24 svg at the default size of 14', () => {
    const { container, unmount } = mount({ name: 'settings' })
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(svg.getAttribute('width')).toBe('14')
    expect(svg.getAttribute('height')).toBe('14')
    unmount()
  })

  it('honours a size override', () => {
    const { container, unmount } = mount({ name: 'close', size: 32 })
    expect(container.querySelector('svg')!.getAttribute('width')).toBe('32')
    unmount()
  })

  it('renders a single stroked path for a path-glyph (close = an X)', () => {
    const { container, unmount } = mount({ name: 'close' })
    const paths = container.querySelectorAll('path')
    expect(paths.length).toBe(1)
    expect(paths[0].getAttribute('stroke')).toBe('currentColor')
    unmount()
  })

  it('renders grouped geometry for a composite glyph (search = circle + path)', () => {
    const { container, unmount } = mount({ name: 'search' })
    expect(container.querySelector('g')).not.toBeNull()
    expect(container.querySelector('circle')).not.toBeNull()
    unmount()
  })
})
