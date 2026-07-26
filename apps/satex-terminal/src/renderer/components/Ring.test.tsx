// @vitest-environment jsdom
/**
 * SATEX — Ring characterization suite (P-134 leaf-component jsdom wave).
 *
 * Pure SVG progress ring. Pins the 0..100 clamp, the rounded centre readout,
 * the dasharray/dashoffset geometry (full at 100, empty at 0), the optional
 * label, and the size/color props. Subject Ring.tsx READ-ONLY (byte-unchanged).
 */
import { describe, it, expect } from 'vitest'
import { act, createElement, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { Ring } from './Ring'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

function mount(props: ComponentProps<typeof Ring>) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(createElement(Ring, props)) })
  return { container, unmount: () => { act(() => { root.unmount() }); container.remove() } }
}

const fg = (c: Element) => c.querySelector('.ring-fg') as SVGCircleElement

describe('Ring — value readout + clamp', () => {
  it('rounds the centre value', () => {
    const { container, unmount } = mount({ value: 42.6 })
    expect(container.querySelector('.ring-text .v')!.textContent).toBe('43')
    unmount()
  })

  it('clamps values above 100 to a full ring (offset 0)', () => {
    const { container, unmount } = mount({ value: 140 })
    expect(container.querySelector('.ring-text .v')!.textContent).toBe('100')
    expect(Math.round(parseFloat(fg(container).style.strokeDashoffset || '0'))).toBe(0)
    unmount()
  })

  it('clamps values below 0 to an empty ring (offset == circumference)', () => {
    const { container, unmount } = mount({ value: -25, size: 80 })
    expect(container.querySelector('.ring-text .v')!.textContent).toBe('0')
    const r = (80 - 10) / 2
    const circumference = 2 * Math.PI * r
    const off = parseFloat(fg(container).style.strokeDashoffset || '0')
    expect(Math.round(off)).toBe(Math.round(circumference))
    unmount()
  })
})

describe('Ring — presentation props', () => {
  it('omits the label div by default and renders it when provided', () => {
    const none = mount({ value: 50 })
    expect(none.container.querySelector('.ring-text .l')).toBeNull()
    none.unmount()
    const some = mount({ value: 50, label: 'EDGE' })
    expect(some.container.querySelector('.ring-text .l')!.textContent).toBe('EDGE')
    some.unmount()
  })

  it('drives the svg viewBox and container box from size', () => {
    const { container, unmount } = mount({ value: 50, size: 120 })
    expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 120 120')
    expect((container.querySelector('.ring') as HTMLElement).style.width).toBe('120px')
    unmount()
  })

  it('drives the fg stroke from color', () => {
    const { container, unmount } = mount({ value: 50, color: 'tomato' })
    expect(fg(container).style.stroke).toBe('tomato')
    unmount()
  })
})
