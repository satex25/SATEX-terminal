/**
 * SATEX — DrawingToolbar (CHART-03 wiring).
 *
 * Compact floating panel that lets the user pick the active drawing tool,
 * undo/redo, and clear. State lives in `drawingStore`; this component is a
 * thin renderer + click router.
 *
 * Mounted from ChartPanel inside `.chart-canvas-wrap` when `drawingOpen`
 * is true. Positioned absolute top-left so it overlays the chart without
 * displacing existing UI.
 */
import { useDrawingStore } from './drawingStore'
import type { DrawingTool } from './DrawingModel'

const TOOLS: ReadonlyArray<{ key: DrawingTool; label: string; title: string }> = [
  { key: 'select',     label: '↖',  title: 'Select / move drawings' },
  { key: 'line',       label: '╱',  title: 'Trend line' },
  { key: 'hline',      label: '─',  title: 'Horizontal line' },
  { key: 'vline',      label: '│',  title: 'Vertical line' },
  { key: 'rect',       label: '▭',  title: 'Rectangle' },
  { key: 'fibonacci',  label: 'φ',  title: 'Fibonacci retracement' },
  { key: 'annotation', label: 'T',  title: 'Text annotation' },
]

interface Props {
  symbol: string
}

export function DrawingToolbar({ symbol }: Props) {
  const activeTool   = useDrawingStore(s => s.activeTool)
  const setActive    = useDrawingStore(s => s.setActiveTool)
  const undo         = useDrawingStore(s => s.undo)
  const redo         = useDrawingStore(s => s.redo)
  const clearSymbol  = useDrawingStore(s => s.clearSymbol)
  const canUndo      = useDrawingStore(s => s.canUndo(symbol))
  const canRedo      = useDrawingStore(s => s.canRedo(symbol))

  const baseBtn: React.CSSProperties = {
    width:        24,
    height:       24,
    border:       '1px solid rgba(47,44,52,0.85)',
    background:   'rgba(13,15,20,0.92)',
    color:        '#e0e0e0',
    fontSize:     12,
    cursor:       'pointer',
    borderRadius: 3,
    padding:      0,
    lineHeight:   1,
  }
  const onBtn: React.CSSProperties = { ...baseBtn, background: 'rgba(233,75,60,0.18)', borderColor: '#e94b3c', color: '#e94b3c' }

  return (
    <div
      style={{
        position:       'absolute',
        top:            6,
        left:           6,
        zIndex:         14,
        display:        'flex',
        gap:            3,
        padding:        3,
        background:     'rgba(13,15,20,0.85)',
        border:         '1px solid rgba(47,44,52,0.85)',
        borderRadius:   4,
        backdropFilter: 'blur(6px)',
      }}
      role="toolbar"
      aria-label="Chart drawing tools"
    >
      {TOOLS.map(t => (
        <button
          key={t.key}
          type="button"
          title={t.title}
          aria-pressed={activeTool === t.key}
          style={activeTool === t.key ? onBtn : baseBtn}
          onClick={() => setActive(t.key)}
        >
          {t.label}
        </button>
      ))}
      <div style={{ width: 1, background: 'rgba(47,44,52,0.85)', margin: '2px 2px' }} aria-hidden />
      <button
        type="button"
        title="Undo last drawing action"
        disabled={!canUndo}
        style={{ ...baseBtn, opacity: canUndo ? 1 : 0.4 }}
        onClick={() => undo(symbol)}
      >↶</button>
      <button
        type="button"
        title="Redo"
        disabled={!canRedo}
        style={{ ...baseBtn, opacity: canRedo ? 1 : 0.4 }}
        onClick={() => redo(symbol)}
      >↷</button>
      <button
        type="button"
        title="Clear all drawings for this symbol"
        style={baseBtn}
        onClick={() => clearSymbol(symbol)}
      >×</button>
    </div>
  )
}
