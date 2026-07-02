/**
 * SATEX — System Logs Panel (Phase 10 · Black Box)
 *
 * Tail of the last ~6 log entries from main-process LOG_EVENT stream.
 * Subscribes to logsStore. Color codes by level — WARN orange, EVENT cyan,
 * ERROR red, others muted.
 */
import { useLogsStore } from '../stores/logsStore'
import { PanelHead } from '../components/PanelHead'
import type { SystemLogEntry } from '@shared/types'

function fmtTime(ts: number): string {
  return new Date(ts).toISOString().slice(11, 19)
}

function levelClass(l: SystemLogEntry['level']): string {
  switch (l) {
    case 'WARN':  return 'bb-log-warn'
    case 'ERROR': return 'bb-log-error'
    case 'EVENT': return 'bb-log-event'
    case 'DEBUG':
    case 'TRACE': return 'bb-log-mute'
    default:      return 'bb-log-info'
  }
}

export function SystemLogsPanel() {
  const tail = useLogsStore(s => s.tail)
  return (
    <div className="bb-logs-panel">
      <PanelHead title="SYSTEM LOGS" right={<span>tail · last 60s</span>} />
      <div className="bb-logs-body">
        {tail.length === 0 && (
          <div className="bb-logs-empty">Waiting for engine events…</div>
        )}
        {tail.map((l, i) => (
          <div key={`${l.ts}-${i}`} className="bb-logs-row">
            <span className="bb-log-time">{fmtTime(l.ts)}</span>
            <span className={`bb-log-level ${levelClass(l.level)}`}>{l.level}</span>
            <span className="bb-log-tag">{l.tag}</span>
            <span className="bb-log-msg">{l.msg}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
