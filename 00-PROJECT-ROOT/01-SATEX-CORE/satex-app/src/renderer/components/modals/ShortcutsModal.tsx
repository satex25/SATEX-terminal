/**
 * SATEX — Keyboard shortcuts cheat sheet.
 */
import { Fragment } from 'react'
import { Modal } from '../Modal'

interface Props { open: boolean; onClose: () => void }

const SECTIONS: Array<{ title: string; note?: string; rows: Array<[string, string]> }> = [
  {
    title: 'Workspace',
    note:  'Switch the center column. Active tape forces Replay.',
    rows: [
      ['Command palette',     '⌘K'],
      ['Workspace · Trade',   '⌘1'],
      ['Workspace · Focus',   '⌘2'],
      ['Workspace · Markets', '⌘3'],
      ['Workspace · Replay',  '⌘4'],
      ['Workspace · Quad',    '⌘5'],
      ['Tweaks panel',        '⌘,'],
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
    title: 'Chart indicators',
    note:  'Toggle the 6 chart overlays — persisted to indicator-toggles.md.',
    rows: [
      ['Indicators modal',  '⌘⇧I'],
    ],
  },
  {
    title: 'Risk',
    note:  'Global — works anywhere. Arming requires a 2-second hold to prevent finger-slip; disarm is instant.',
    rows: [
      ['Arm kill switch (hold 2s)',  '⌘⇧K (hold)'],
      ['Disarm kill switch',         '⌘⇧K (tap)'],
    ],
  },
  {
    title: 'Order ticket',
    note:  'Active when the Exec ticket has focus.',
    rows: [
      ['BUY / SELL',  'B / S'],
      ['Market type', 'M'],
      ['Limit type',  'L'],
      ['Stop type',   'T'],
      ['Submit',      '↵'],
    ],
  },
  {
    title: 'Replay',
    note:  'Active in the Replay workspace or during live replay.',
    rows: [
      ['Play / Pause',         'Space'],
      ['Seek ±5 seconds',      '← / →'],
      ['Speed step down / up', '[ / ]'],
      ['Bookmark current',     'B'],
    ],
  },
  {
    title: 'Notifications',
    note:  'Native OS notifications fire automatically — no shortcut needed.',
    rows: [
      ['Order fill',                  'auto'],
      ['Kill switch armed',           'auto'],
      ['Daily loss ≥ 80% of cap',     'auto'],
      ['Regime transition',           'auto'],
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
            {s.note && (
              <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginBottom: 8, lineHeight: 1.45 }}>
                {s.note}
              </div>
            )}
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
