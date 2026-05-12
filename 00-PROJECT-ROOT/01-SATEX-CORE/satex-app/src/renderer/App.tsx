/**
 * SATEX — Root Application Component
 * 4-row shell: MenuBar (40px) · TickerRail (32px) · Canvas (1fr) · OrderBar (56px).
 * Canvas is a 24-column CSS grid with widget placements coming from PRESETS.
 * All data flows via Zustand stores fed by useIPC.
 */
import { useEffect, useMemo, useState } from 'react'
import { useIPC } from './hooks/useIPC'
import { useMarketStore } from './stores/marketStore'
import { MenuBar, type ModalKind } from './components/MenuBar'
import { TickerRail } from './components/TickerRail'
import { OrderBar } from './components/OrderBar'
import { CommandPalette } from './components/CommandPalette'
import { WidgetShell } from './components/WidgetShell'
import { AboutModal } from './components/modals/AboutModal'
import { ShortcutsModal } from './components/modals/ShortcutsModal'
import { SettingsModal } from './components/modals/SettingsModal'
import { LiveModeModal } from './components/modals/LiveModeModal'
import { TacticsModal } from './components/modals/TacticsModal'
import { WatchlistPanel }   from './panels/WatchlistPanel'
import { ChartPanel }       from './panels/ChartPanel'
import { OrderTicketPanel } from './panels/OrderTicketPanel'
import { PortfolioPanel }   from './panels/PortfolioPanel'
import { NewsPanel }        from './panels/NewsPanel'
import { AIInsightsPanel }  from './panels/AIInsightsPanel'
import { DepthPanel }       from './panels/DepthPanel'
import { HeatmapPanel }     from './panels/HeatmapPanel'
import { CalendarPanel }    from './panels/CalendarPanel'

// ── Widget registry ───────────────────────────────────────────────────────────
type WidgetId = 'watchlist' | 'chart' | 'ticket' | 'depth' | 'ai' | 'positions' | 'news' | 'heatmap' | 'calendar'

interface WidgetDef {
  title: string
  meta?: string | null
  flush?: boolean
  render: () => JSX.Element
}

const WIDGETS: Record<WidgetId, WidgetDef> = {
  watchlist: { title: 'WATCHLIST',  render: () => <WatchlistPanel /> },
  chart:     { title: 'CHART',      flush: true, render: () => <ChartPanel /> },
  ticket:    { title: 'ORDER TICKET', flush: true, render: () => <OrderTicketPanel /> },
  depth:     { title: 'DEPTH · L2', meta: 'NBBO', flush: true, render: () => <DepthPanel /> },
  ai:        { title: 'AI INSIGHTS', render: () => <AIInsightsPanel /> },
  positions: { title: 'PORTFOLIO',   render: () => <PortfolioPanel /> },
  news:      { title: 'CATALYSTS',   meta: 'live', render: () => <NewsPanel /> },
  heatmap:   { title: 'SECTORS',     flush: true, render: () => <HeatmapPanel /> },
  calendar:  { title: 'CALENDAR',    render: () => <CalendarPanel /> },
}

// ── Layout presets — 24-col × 16-row grid placements ──────────────────────────
interface Cell { id: WidgetId; col: number; cs: number; row: number; rs: number }
interface Preset { name: string; rows: number; layout: Cell[] }

const PRESETS: Preset[] = [
  {
    name: 'Trade', rows: 16,
    layout: [
      { id: 'watchlist', col: 1,  cs: 4,  row: 1,  rs: 11 },
      { id: 'chart',     col: 5,  cs: 13, row: 1,  rs: 11 },
      { id: 'ticket',    col: 18, cs: 4,  row: 1,  rs: 11 },
      { id: 'ai',        col: 22, cs: 3,  row: 1,  rs: 7  },
      { id: 'depth',     col: 22, cs: 3,  row: 8,  rs: 4  },
      { id: 'positions', col: 1,  cs: 8,  row: 12, rs: 5  },
      { id: 'news',      col: 9,  cs: 9,  row: 12, rs: 5  },
      { id: 'heatmap',   col: 18, cs: 7,  row: 12, rs: 5  },
    ],
  },
  {
    name: 'Analyze', rows: 16,
    layout: [
      { id: 'watchlist', col: 1,  cs: 4,  row: 1,  rs: 16 },
      { id: 'chart',     col: 5,  cs: 14, row: 1,  rs: 11 },
      { id: 'ai',        col: 19, cs: 6,  row: 1,  rs: 11 },
      { id: 'heatmap',   col: 5,  cs: 9,  row: 12, rs: 5  },
      { id: 'news',      col: 14, cs: 11, row: 12, rs: 5  },
    ],
  },
  {
    name: 'Scan', rows: 16,
    layout: [
      { id: 'watchlist', col: 1,  cs: 5,  row: 1,  rs: 16 },
      { id: 'heatmap',   col: 6,  cs: 13, row: 1,  rs: 8  },
      { id: 'chart',     col: 6,  cs: 13, row: 9,  rs: 8  },
      { id: 'news',      col: 19, cs: 6,  row: 1,  rs: 10 },
      { id: 'calendar',  col: 19, cs: 6,  row: 11, rs: 6  },
    ],
  },
  {
    name: 'Replay', rows: 16,
    layout: [
      { id: 'chart',     col: 1,  cs: 18, row: 1,  rs: 12 },
      { id: 'ai',        col: 19, cs: 6,  row: 1,  rs: 8  },
      { id: 'depth',     col: 19, cs: 6,  row: 9,  rs: 8  },
      { id: 'positions', col: 1,  cs: 9,  row: 13, rs: 4  },
      { id: 'news',      col: 10, cs: 9,  row: 13, rs: 4  },
    ],
  },
]

const PRESET_NAMES = PRESETS.map(p => p.name)

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  useIPC()

  const [presetIdx, setPresetIdx] = useState(0)
  const [cmdOpen,   setCmdOpen]   = useState(false)
  const [modal,     setModal]     = useState<ModalKind | null>(null)
  const [focused,   setFocused]   = useState<WidgetId>('chart')
  const [hidden,    setHidden]    = useState<Partial<Record<WidgetId, boolean>>>({})
  const [layouts,   setLayouts]   = useState<Cell[][]>(() => PRESETS.map(p => p.layout.map(c => ({ ...c }))))
  const [drag,      setDrag]      = useState<{ from: WidgetId | null; over: WidgetId | null }>({ from: null, over: null })
  const [liveMode,  setLiveMode]  = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const s = await window.satex?.getLiveMode?.()
        if (s) setLiveMode(s.enabled)
      } catch { /* ignore */ }
    })()
  }, [modal])

  // Tokyo Capital — vermilion is the brand accent and the :root default,
  // so we only need to assert the theme on mount.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'tokyo')
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdOpen(o => !o); return }
      if (mod && e.key >= '1' && e.key <= '4') { e.preventDefault(); setPresetIdx(+e.key - 1); return }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'd') { e.preventDefault(); window.satex?.toggleDevTools(); return }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); window.satex?.killSwitch(true); return }
      if (mod && e.key === 'Enter') { e.preventDefault(); window.satex?.toggleFullscreen(); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const preset = PRESETS[presetIdx]!
  const layout = layouts[presetIdx]!
  const visible = useMemo(() => layout.filter(c => !hidden[c.id]), [layout, hidden])

  // Force chart to remount when the symbol changes so lightweight-charts cleanly resets
  const symbol = useMarketStore(s => s.symbol)

  function onDragStart(id: WidgetId) { setDrag({ from: id, over: null }) }
  function onDragOver(id: WidgetId, e: React.DragEvent) { e.preventDefault(); setDrag(d => ({ ...d, over: id })) }
  function onDrop(target: WidgetId) {
    if (!drag.from || drag.from === target) { setDrag({ from: null, over: null }); return }
    setLayouts(prev => {
      const next = prev.map(arr => arr.map(c => ({ ...c })))
      const cur  = next[presetIdx]!
      const a = cur.find(c => c.id === drag.from)
      const b = cur.find(c => c.id === target)
      if (a && b) {
        const tmp = { col: a.col, cs: a.cs, row: a.row, rs: a.rs }
        a.col = b.col; a.cs = b.cs; a.row = b.row; a.rs = b.rs
        b.col = tmp.col; b.cs = tmp.cs; b.row = tmp.row; b.rs = tmp.rs
      }
      return next
    })
    setDrag({ from: null, over: null })
  }

  return (
    <div className="app">
      <MenuBar
        onCmd={() => setCmdOpen(true)}
        onOpenModal={setModal}
        presetIdx={presetIdx}
        setPresetIdx={setPresetIdx}
        presets={PRESET_NAMES}
        liveModeEnabled={liveMode}
      />
      <TickerRail />

      <div className="canvas" style={{ gridTemplateRows: `repeat(${preset.rows}, minmax(0, 1fr))` }}>
        {visible.map(cell => {
          const W = WIDGETS[cell.id]
          return (
            <div
              key={cell.id}
              style={{
                gridColumn: `${cell.col} / span ${cell.cs}`,
                gridRow:    `${cell.row} / span ${cell.rs}`,
                minHeight: 0, minWidth: 0,
              }}
            >
              <WidgetShell
                title={W.title}
                meta={W.meta}
                flush={W.flush}
                focused={focused === cell.id}
                dragging={drag.from === cell.id}
                dropTarget={drag.over === cell.id && drag.from !== cell.id}
                onFocus={() => setFocused(cell.id)}
                onClose={() => setHidden(h => ({ ...h, [cell.id]: true }))}
                onDragStart={() => onDragStart(cell.id)}
                onDragOver={e => onDragOver(cell.id, e)}
                onDrop={() => onDrop(cell.id)}
              >
                {/* Force chart remount on symbol change; other panels memo via their own selectors. */}
                {cell.id === 'chart' ? <ChartHost key={symbol} /> : W.render()}
              </WidgetShell>
            </div>
          )
        })}
      </div>

      <OrderBar />

      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        onSetPreset={setPresetIdx}
      />

      <AboutModal     open={modal === 'about'}     onClose={() => setModal(null)} />
      <ShortcutsModal open={modal === 'shortcuts'} onClose={() => setModal(null)} />
      <SettingsModal  open={modal === 'settings'}  onClose={() => setModal(null)} />
      <LiveModeModal  open={modal === 'live'}      onClose={() => setModal(null)} />
      <TacticsModal   open={modal === 'tactics'}   onClose={() => setModal(null)} />
    </div>
  )
}

function ChartHost() {
  return <ChartPanel />
}
