// @vitest-environment jsdom
/**
 * SATEX — Dropdown characterization suite (P-134 leaf-component jsdom wave).
 *
 * Menu dropdown that portals its panel to <body> (load-bearing — the drag-region
 * compositing fix diagnosed 2026-07-16). Pins the toggle, the portal target, the
 * item/divider/header render, the disabled-item guard, Esc + click-outside close,
 * and the portal + listener CLEANUP on unmount (§2.5.7 leak class). Subject
 * Dropdown.tsx READ-ONLY (byte-unchanged).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, createElement, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { Dropdown, type DropdownItem } from './Dropdown'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

function mount(props: ComponentProps<typeof Dropdown>) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(createElement(Dropdown, props)) })
  return {
    container,
    trigger: () => container.querySelector('.menu-item') as HTMLElement,
    panel: () => document.body.querySelector('.dropdown-panel'),
    unmount: () => { act(() => { root.unmount() }); container.remove() },
  }
}

afterEach(() => {
  // Belt-and-braces: no stray portal panels leak between tests.
  document.body.querySelectorAll('.dropdown-panel').forEach(n => n.remove())
})

const items: DropdownItem[] = [
  { header: 'FILE' },
  { label: 'Open', kbd: 'Ctrl+O', onClick: () => {} },
  { divider: true },
  { label: 'Disabled', disabled: true, onClick: () => {} },
]

describe('Dropdown — toggle + portal', () => {
  it('renders a role=button trigger and no panel until opened', () => {
    const h = mount({ label: 'Menu', items })
    expect(h.trigger().getAttribute('role')).toBe('button')
    expect(h.trigger().textContent).toBe('Menu')
    expect(h.panel()).toBeNull()
    h.unmount()
  })

  it('opens the panel into document.body (a portal, not a trigger descendant)', () => {
    const h = mount({ label: 'Menu', items })
    act(() => { h.trigger().click() })
    const panel = h.panel()!
    expect(panel).not.toBeNull()
    expect(panel.getAttribute('role')).toBe('menu')
    // portaled: the panel is NOT inside the component container
    expect(h.container.querySelector('.dropdown-panel')).toBeNull()
    expect(h.trigger().classList.contains('open')).toBe(true)
    h.unmount()
  })
})

describe('Dropdown — item rendering', () => {
  it('renders headers, dividers, and labelled items with their kbd hint', () => {
    const h = mount({ label: 'Menu', items })
    act(() => { h.trigger().click() })
    const panel = h.panel()!
    expect(panel.querySelector('.dropdown-header')!.textContent).toBe('FILE')
    expect(panel.querySelector('.dropdown-divider')).not.toBeNull()
    const open = panel.querySelector('.dropdown-item')!
    expect(open.querySelector('span')!.textContent).toBe('Open')
    expect(open.querySelector('.kbd')!.textContent).toBe('Ctrl+O')
    h.unmount()
  })
})

describe('Dropdown — selection + guards', () => {
  it('clicking an enabled item fires its onClick and closes the menu', () => {
    const onClick = vi.fn()
    const h = mount({ label: 'Menu', items: [{ label: 'Go', onClick }] })
    act(() => { h.trigger().click() })
    const item = h.panel()!.querySelector('.dropdown-item') as HTMLElement
    act(() => { item.click() })
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(h.panel()).toBeNull() // closed after selection
    h.unmount()
  })

  it('a disabled item does not fire onClick and keeps the menu open', () => {
    const onClick = vi.fn()
    const h = mount({ label: 'Menu', items: [{ label: 'Nope', disabled: true, onClick }] })
    act(() => { h.trigger().click() })
    const item = h.panel()!.querySelector('.dropdown-item.disabled') as HTMLElement
    act(() => { item.click() })
    expect(onClick).not.toHaveBeenCalled()
    expect(h.panel()).not.toBeNull() // still open
    h.unmount()
  })
})

describe('Dropdown — close paths + cleanup (leak class)', () => {
  it('Escape closes the open menu', () => {
    const h = mount({ label: 'Menu', items })
    act(() => { h.trigger().click() })
    expect(h.panel()).not.toBeNull()
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(h.panel()).toBeNull()
    h.unmount()
  })

  it('an outside mousedown closes the open menu', () => {
    const h = mount({ label: 'Menu', items })
    act(() => { h.trigger().click() })
    expect(h.panel()).not.toBeNull()
    act(() => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    expect(h.panel()).toBeNull()
    h.unmount()
  })

  it('removes the portal panel and its window listeners on unmount', () => {
    const h = mount({ label: 'Menu', items })
    act(() => { h.trigger().click() })
    expect(document.body.querySelectorAll('.dropdown-panel').length).toBe(1)
    h.unmount()
    expect(document.body.querySelectorAll('.dropdown-panel').length).toBe(0)
    // post-unmount events must not throw / must be inert (listeners removed)
    expect(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    }).not.toThrow()
  })
})
