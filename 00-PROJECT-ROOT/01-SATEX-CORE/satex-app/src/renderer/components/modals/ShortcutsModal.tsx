/**
 * SATEX — Keyboard shortcuts cheat sheet.
 */
import { Fragment } from 'react'
import { Modal } from '../Modal'

interface Props { open: boolean; onClose: () => void }

const SECTIONS: Array<{ title: string; rows: Array<[string, string]> }> = [
  {
    title: 'Workspace',
    rows: [
      ['Command palette',     '⌘K'],
      ['Workspace · Trade',   '⌘1'],
      ['Workspace · Analyze', '⌘2'],
      ['Workspace · Scan',    '⌘3'],
      ['Workspace · Replay',  '⌘4'],
    ],
  },
  {
    title: 'Window',
    rows: [
      ['Toggle fullscreen', '⌘↵'],
      ['Toggle DevTools',   '⌘⇧D'],
    ],
  },
  {
    title: 'Risk',
    rows: [
      ['Arm/disarm kill switch', '⌘⇧K'],
    ],
  },
  {
    title: 'Order ticket',
    rows: [
      ['BUY / SELL',  'B / S'],
      ['Market type', 'M'],
      ['Limit type',  'L'],
      ['Stop type',   'T'],
      ['Submit',      '↵'],
    ],
  },
]

export function ShortcutsModal({ open, onClose }: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Keyboard shortcuts"
      kanji="鍵"
      size="wide"
      footer={<button type="button" className="dialog-btn primary" onClick={onClose}>Close</button>}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 28px' }}>
        {SECTIONS.map(s => (
          <div className="dialog-section" key={s.title}>
            <div className="dialog-section-title">{s.title}</div>
            <div className="kbd-list">
              {s.rows.map(([label, key]) => (
                <Fragment key={`${s.title}-${label}`}>
                  <div className="label">{label}</div>
                  <div><span className="kbd-key">{key}</span></div>
                </Fragment>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}
