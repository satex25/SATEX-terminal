/**
 * SATEX — Tweaks Panel (Phase 10 · Black Box)
 *
 * Floating chart-options panel. Adapted from mc4 (1)/tweaks-panel.jsx but
 * stripped of the host-iframe protocol (we're not in a Figma-Make iframe).
 * Persists via useChartOpts → localStorage; the QuadChart consumes the same
 * hook so changes propagate instantly without prop drilling.
 */
import { useEffect, useRef, useState } from 'react'
import { useChartOpts, type CandleStyle, type ChartGridMode, type TickRate } from '../hooks/useChartOpts'

interface Props {
  open:    boolean
  onClose: () => void
}

export function TweaksPanel({ open, onClose }: Props) {
  const [opts, setOpt] = useChartOpts()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ right: number; bottom: number }>({ right: 16, bottom: 16 })

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX, startY = e.clientY
    const startR = pos.right, startB = pos.bottom
    const move = (ev: MouseEvent) => {
      setPos({
        right:  Math.max(8, startR - (ev.clientX - startX)),
        bottom: Math.max(8, startB - (ev.clientY - startY)),
      })
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <div ref={panelRef} className="bb-tweaks-panel" style={{ right: pos.right, bottom: pos.bottom }}>
      <div className="bb-tweaks-head" onMouseDown={onDragStart}>
        <span>CHART · DATA TWEAKS</span>
        <button type="button" className="bb-tweaks-close" onClick={onClose}>✕</button>
      </div>
      <div className="bb-tweaks-body">

        <div className="bb-tweaks-section">CANDLE THEME</div>
        <Radio<CandleStyle>
          label="Style"
          value={opts.candleStyle}
          options={[
            { value: 'classic', label: 'Classic' },
            { value: 'mono',    label: 'Mono' },
            { value: 'cyan',    label: 'Cyan' },
          ]}
          onChange={(v) => setOpt('candleStyle', v)}
        />

        <div className="bb-tweaks-section">OVERLAYS</div>
        <Toggle label="EMA 9"  value={opts.showEMA9}  onChange={(v) => setOpt('showEMA9', v)} />
        <Toggle label="EMA 21" value={opts.showEMA21} onChange={(v) => setOpt('showEMA21', v)} />
        <Toggle label="VWAP"   value={opts.showVWAP}  onChange={(v) => setOpt('showVWAP', v)} />

        <div className="bb-tweaks-section">DATA</div>
        <Radio<ChartGridMode>
          label="Grid"
          value={opts.chartGrid}
          options={[
            { value: 'minimal', label: 'Minimal' },
            { value: 'dense',   label: 'Dense' },
            { value: 'off',     label: 'Off' },
          ]}
          onChange={(v) => setOpt('chartGrid', v)}
        />
        <Radio<TickRate>
          label="Tick rate"
          value={opts.tickRate}
          options={[
            { value: '500ms', label: '½s' },
            { value: '1s',    label: '1s' },
            { value: '5s',    label: '5s' },
          ]}
          onChange={(v) => setOpt('tickRate', v)}
        />

      </div>
    </div>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="bb-tweaks-row">
      <span className="bb-tweaks-label">{label}</span>
      <button
        type="button"
        className={`bb-toggle ${value ? 'on' : ''}`}
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
      ><i /></button>
    </div>
  )
}

function Radio<T extends string>({ label, value, options, onChange }: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="bb-tweaks-row bb-tweaks-row-col">
      <span className="bb-tweaks-label">{label}</span>
      <div className="bb-tweaks-seg">
        {options.map(o => (
          <button
            key={o.value}
            type="button"
            className={value === o.value ? 'on' : ''}
            onClick={() => onChange(o.value)}
          >{o.label}</button>
        ))}
      </div>
    </div>
  )
}
