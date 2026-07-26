// @vitest-environment jsdom
/**
 * SATEX — StatPill characterization suite (P-134 leaf-component jsdom wave).
 *
 * Pure presentational primitive (props → DOM), rendered with the P-133 zero-dep
 * createRoot + act harness. No store, no IPC, no timer, no listener. Pins the
 * dot/label/value structure, the onClick→role=button + bb-clickable gate, and
 * the pulse class. Subject StatPill.tsx is READ-ONLY here (byte-unchanged).
 */
import { describe, it, expect, vi } from 'vitest'
import { act, createElement, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { StatPill } from './StatPill'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

function mount(props: ComponentProps<typeof StatPill>) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(createElement(StatPill, props)) })
  return { container, unmount: () => { act(() => { root.unmount() }); container.remove() } }
}

describe('StatPill — structure', () => {
  it('renders the label, value, and a dot span carrying the dot color', () => {
    const { container, unmount } = mount({ dot: '#22c55e', label: 'LAT', value: '12ms' })
    const pill = container.querySelector('.bb-stat-pill')!
    expect(pill).not.toBeNull()
    expect(container.querySelector('.bb-stat-label')!.textContent).toBe('LAT')
    expect(container.querySelector('.bb-stat-value')!.textContent).toBe('12ms')
    const dot = container.querySelector('.bb-stat-dot') as HTMLElement
    expect(dot.style.background).not.toBe('')
    unmount()
  })

  it('accepts a ReactNode value (not just a string)', () => {
    const { container, unmount } = mount({ dot: '#000', label: 'X', value: createElement('b', null, '9') })
    const value = container.querySelector('.bb-stat-value')!
    expect(value.querySelector('b')!.textContent).toBe('9')
    unmount()
  })

  it('reflects the title attribute onto the pill', () => {
    const { container, unmount } = mount({ dot: '#000', label: 'X', value: '1', title: 'hover me' })
    expect(container.querySelector('.bb-stat-pill')!.getAttribute('title')).toBe('hover me')
    unmount()
  })
})

describe('StatPill — interactivity gate', () => {
  it('is inert (no role, no bb-clickable) without an onClick', () => {
    const { container, unmount } = mount({ dot: '#000', label: 'X', value: '1' })
    const pill = container.querySelector('.bb-stat-pill')!
    expect(pill.getAttribute('role')).toBeNull()
    expect(pill.classList.contains('bb-clickable')).toBe(false)
    unmount()
  })

  it('becomes a button (role + bb-clickable) and fires onClick when given a handler', () => {
    const onClick = vi.fn()
    const { container, unmount } = mount({ dot: '#000', label: 'X', value: '1', onClick })
    const pill = container.querySelector('.bb-stat-pill') as HTMLElement
    expect(pill.getAttribute('role')).toBe('button')
    expect(pill.classList.contains('bb-clickable')).toBe(true)
    act(() => { pill.click() })
    expect(onClick).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('adds bb-pulse only when pulse is set', () => {
    const off = mount({ dot: '#000', label: 'X', value: '1' })
    expect(off.container.querySelector('.bb-stat-pill')!.classList.contains('bb-pulse')).toBe(false)
    off.unmount()
    const on = mount({ dot: '#000', label: 'X', value: '1', pulse: true })
    expect(on.container.querySelector('.bb-stat-pill')!.classList.contains('bb-pulse')).toBe(true)
    on.unmount()
  })
})
