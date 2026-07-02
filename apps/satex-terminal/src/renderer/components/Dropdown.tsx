/**
 * SATEX — Menu dropdown.
 * Click trigger to toggle. Click-outside or Esc closes.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'

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

export function Dropdown({ label, items }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
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
    <div className="dropdown-anchor" ref={ref}>
      <div
        className={`menu-item${open ? ' open' : ''}`}
        onClick={() => setOpen(o => !o)}
        role="button"
        tabIndex={0}
      >
        {label}
      </div>
      {open && (
        <div className="dropdown-panel" role="menu">
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
        </div>
      )}
    </div>
  )
}
