/**
 * SATEX — Generic dialog modal shell.
 * Reuses .modal-back backdrop. Esc closes. Click-out closes.
 */
import { useEffect, type ReactNode } from 'react'
import { Icon } from './Icon'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  kanji?: string
  footer?: ReactNode
  size?: 'small' | 'default' | 'wide'
  children: ReactNode
}

export function Modal({ open, onClose, title, kanji, footer, size = 'default', children }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const cls = size === 'small' ? 'dialog small' : size === 'wide' ? 'dialog wide' : 'dialog'

  return (
    <div className="modal-back" onClick={onClose}>
      <div className={cls} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="dialog-head">
          <div className="dialog-title">
            {kanji && <span className="kanji">{kanji}</span>}
            {title}
          </div>
          <button type="button" className="dialog-close" onClick={onClose} aria-label="Close">
            <Icon name="close" size={12} />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-footer">{footer}</div>}
      </div>
    </div>
  )
}
