/**
 * SATEX — Menu dropdown.
 * Click trigger to toggle. Click-outside or Esc closes.
 *
 * The panel is rendered through a portal into `document.body` rather than as a
 * DOM descendant of the trigger. This is load-bearing, not cosmetic: the menu
 * bar lives inside the `-webkit-app-region: drag` titlebar (`.bb-topbar`), and
 * Chromium's drag-region compositing path drops an absolutely-positioned child
 * that overflows the drag region — the panel was in the DOM, opaque and
 * correctly positioned, yet never painted on screen (diagnosed 2026-07-16 via
 * CDP against the live renderer). Portaling to <body> takes the panel out of
 * the drag-region subtree so it composites normally; a `fixed` position derived
 * from the trigger's rect keeps it visually anchored under its button.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface DropdownItem {
  label?: string
  kbd?: string
  onClick?: () => void
  disabled?: boolean
  divider?: boolean
  header?: string
}

interface Props {
  label: string
  items: DropdownItem[]
}

interface Pos { top: number; left: number }

export function Dropdown({ label, items }: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<Pos>({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Anchor the portaled panel just below the trigger. Recomputed on open and
  // kept in sync while open (window resize / zoom changes the titlebar layout).
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const r = triggerRef.current?.getBoundingClientRect()
      if (r) setPos({ top: r.bottom + 4, left: r.left })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node
      // The panel is portaled out of the trigger subtree, so guard both.
      if (triggerRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="dropdown-anchor" ref={triggerRef}>
      <div
        className={`menu-item${open ? ' open' : ''}`}
        onClick={() => setOpen(o => !o)}
        role="button"
        tabIndex={0}
      >
        {label}
      </div>
      {open && createPortal(
        <div
          className="dropdown-panel"
          role="menu"
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left }}
        >
          {items.map((it, i): ReactNode => {
            if (it.divider) return <div key={`d-${i}`} className="dropdown-divider" />
            if (it.header)  return <div key={`h-${i}`} className="dropdown-header">{it.header}</div>
            return (
              <div
                key={`i-${i}`}
                className={`dropdown-item${it.disabled ? ' disabled' : ''}`}
                onClick={() => { if (!it.disabled) { it.onClick?.(); setOpen(false) } }}
                role="menuitem"
              >
                <span>{it.label}</span>
                {it.kbd && <span className="kbd">{it.kbd}</span>}
              </div>
            )
          })}
        </div>,
        document.body,
      )}
    </div>
  )
}
