/**
 * SATEX — About dialog. Tokyo Capital identity flourish.
 */
import { Modal } from '../Modal'

interface Props { open: boolean; onClose: () => void }

export function AboutModal({ open, onClose }: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="SATEX"
      kanji="朱"
      footer={<button type="button" className="dialog-btn primary" onClick={onClose}>Continue</button>}
    >
      <div className="dialog-section">
        <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 20, color: 'var(--accent)', marginBottom: 4 }}>
          Smart Autonomous Trading EXperience
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-2)', letterSpacing: '0.04em' }}>
          取引端末 · Tokyo Capital · v0.4
        </div>
      </div>

      <div className="dialog-section">
        <div className="dialog-section-title">Design</div>
        <p style={{ margin: 0 }}>
          Lacquer & vermilion. Warm urushi black surfaces, vermilion 朱 accent on focus and confirmation,
          universal bull/bear signals for market direction.
        </p>
      </div>

      <div className="dialog-section">
        <div className="dialog-section-title">Stack</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.7 }}>
          Electron 41 · React 18 · TypeScript 5.4 · Zustand · Lightweight-charts 5 · Alpaca paper API · better-sqlite3
        </div>
      </div>

      <div className="dialog-section">
        <div className="dialog-section-title">Locked invariants</div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11.5, lineHeight: 1.7 }}>
          <li>Paper-mode by default. Live-mode requires typed confirmation.</li>
          <li>Six-gate risk validation before every order.</li>
          <li>Kill switch is global and cannot be bypassed by signals.</li>
          <li>MAY-TACTICS pre-trade gate (after calibration period).</li>
        </ul>
      </div>
    </Modal>
  )
}
