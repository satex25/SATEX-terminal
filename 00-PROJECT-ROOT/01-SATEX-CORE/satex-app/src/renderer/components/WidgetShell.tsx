/**
 * SATEX — Widget shell.
 * Provides the consistent widget frame (grip, title, meta, actions, body)
 * around each panel placed on the canvas grid.
 */
import type { ReactNode, DragEvent, MouseEvent } from 'react'
import { Icon } from './Icon'

interface Props {
  title: string
  meta?: string | null
  actions?: ReactNode
  children: ReactNode
  focused?: boolean
  flush?: boolean
  dragging?: boolean
  dropTarget?: boolean
  onFocus?: () => void
  onClose?: () => void
  onDragStart?: (e: DragEvent<HTMLDivElement>) => void
  onDragOver?: (e: DragEvent<HTMLDivElement>) => void
  onDrop?: (e: DragEvent<HTMLDivElement>) => void
}

export function WidgetShell({
  title, meta, actions, children,
  focused, flush, dragging, dropTarget,
  onFocus, onClose, onDragStart, onDragOver, onDrop,
}: Props) {
  const klass = [
    'widget',
    focused ? 'focused' : '',
    dragging ? 'dragging' : '',
    dropTarget ? 'drop-target' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      className={klass}
      onClick={onFocus}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="widget-head">
        <div className="widget-grip" draggable onDragStart={onDragStart}>
          <span /><span /><span /><span /><span /><span />
        </div>
        <div className="widget-title">{title}</div>
        {meta && <div className="widget-meta">· {meta}</div>}
        <div className="widget-actions">
          {actions}
          {onClose && (
            <button
              type="button"
              className="widget-action"
              onClick={(e: MouseEvent) => { e.stopPropagation(); onClose() }}
              aria-label="Close widget"
            >
              <Icon name="close" size={12} />
            </button>
          )}
        </div>
      </div>
      <div className={`widget-body${flush ? ' flush' : ''}`}>{children}</div>
    </div>
  )
}
