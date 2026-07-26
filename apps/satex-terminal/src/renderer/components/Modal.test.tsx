// @vitest-environment jsdom
/**
 * SATEX — Modal characterization suite (P-134 leaf-component jsdom wave).
 *
 * Generic dialog shell. Pins the open/closed gate, the dialog structure and
 * size-class map, the kanji/footer conditionals, backdrop-vs-body click
 * behaviour, Esc-to-close, and — the load-bearing part — the keydown listener
 * CLEANUP on unmount (the PR #6 / §2.5.7 leak class the whole repo guards).
 * Subject Modal.tsx READ-ONLY (byte-unchanged).
 */
import { describe, it, expect, vi } from 'vitest'
import { act, createElement, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { Modal } from './Modal'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

function mount(props: ComponentProps<typeof Modal>) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(createElement(Modal, props)) })
  return { container, unmount: () => { act(() => { root.unmount() }); container.remove() } }
}

const base = {
  onClose: () => {},
  title: 'Settings',
  children: createElement('div', { className: 'kids' }, 'CONTENT'),
}

function pressEscape() {
  act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
}

describe('Modal — open/closed gate', () => {
  it('renders nothing when closed', () => {
    const { container, unmount } = mount({ ...base, open: false })
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(container.textContent).toBe('')
    unmount()
  })

  it('renders a labelled dialog with the title and body when open', () => {
    const { container, unmount } = mount({ ...base, open: true })
    const dialog = container.querySelector('[role="dialog"]')!
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(container.querySelector('.dialog-title')!.textContent).toContain('Settings')
    expect(container.querySelector('.kids')!.textContent).toBe('CONTENT')
    unmount()
  })
})

describe('Modal — variants', () => {
  it.each([
    ['small', 'dialog small'],
    ['default', 'dialog'],
    ['wide', 'dialog wide'],
  ] as const)('maps size=%s to class "%s"', (size, cls) => {
    const { container, unmount } = mount({ ...base, open: true, size })
    expect(container.querySelector('[role="dialog"]')!.className).toBe(cls)
    unmount()
  })

  it('renders kanji and footer only when provided', () => {
    const none = mount({ ...base, open: true })
    expect(none.container.querySelector('.kanji')).toBeNull()
    expect(none.container.querySelector('.dialog-footer')).toBeNull()
    none.unmount()
    const some = mount({ ...base, open: true, kanji: '設定', footer: createElement('span', null, 'FOOT') })
    expect(some.container.querySelector('.kanji')!.textContent).toBe('設定')
    expect(some.container.querySelector('.dialog-footer')!.textContent).toBe('FOOT')
    some.unmount()
  })
})

describe('Modal — close paths', () => {
  it('the close button calls onClose', () => {
    const onClose = vi.fn()
    const { container, unmount } = mount({ ...base, open: true, onClose })
    act(() => { (container.querySelector('.dialog-close') as HTMLButtonElement).click() })
    expect(onClose).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('clicking the backdrop closes; clicking inside the dialog does not', () => {
    const onClose = vi.fn()
    const { container, unmount } = mount({ ...base, open: true, onClose })
    act(() => { (container.querySelector('.dialog') as HTMLElement).click() })
    expect(onClose).not.toHaveBeenCalled() // stopPropagation on the dialog body
    act(() => { (container.querySelector('.modal-back') as HTMLElement).click() })
    expect(onClose).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('Escape closes while open', () => {
    const onClose = vi.fn()
    const { unmount } = mount({ ...base, open: true, onClose })
    pressEscape()
    expect(onClose).toHaveBeenCalledTimes(1)
    unmount()
  })
})

describe('Modal — listener cleanup (leak class)', () => {
  it('removes the keydown listener on unmount — Escape after unmount does not fire onClose', () => {
    const onClose = vi.fn()
    const { unmount } = mount({ ...base, open: true, onClose })
    unmount()
    pressEscape()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not register a keydown listener while closed', () => {
    const onClose = vi.fn()
    const { unmount } = mount({ ...base, open: false, onClose })
    pressEscape()
    expect(onClose).not.toHaveBeenCalled()
    unmount()
  })
})
