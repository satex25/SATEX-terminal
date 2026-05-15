/**
 * SATEX — Catalysts Panel (Phase 10 · Black Box)
 *
 * Replaces NewsPanel. Renders the top 5 most recent items from marketStore.news
 * with Black Box severity dots, ticker chip, and relative timestamp.
 */
import { useMarketStore } from '../stores/marketStore'
import { PanelHead } from '../components/PanelHead'
import type { NewsItem } from '@shared/types'

function fmtTime(ts: number): string {
  return new Date(ts).toISOString().slice(11, 19)
}

function severity(item: NewsItem): 'high' | 'med' | 'low' {
  if (item.kind === 'breaking' || item.kind === 'earnings') return 'high'
  if (item.kind === 'macro' || item.kind === 'flow')        return 'med'
  return 'low'
}

const DOTS: Record<'high' | 'med' | 'low', string> = { high: '●●●', med: '●●', low: '●' }

export function CatalystsPanel() {
  const news = useMarketStore(s => s.news)
  const items = news.slice(0, 5)
  return (
    <div className="bb-catalysts-panel">
      <PanelHead title="CATALYSTS · LIVE" right={<span>SEV ▲ · last 60m</span>} />
      <div className="bb-catalysts-body">
        {items.length === 0 && <div className="bb-catalysts-empty">No catalysts yet</div>}
        {items.map(it => {
          const sev = severity(it)
          return (
            <div key={it.id} className="bb-catalyst-row">
              <span className="bb-cat-time">{fmtTime(it.publishedAt)}</span>
              <span className={`bb-cat-sev bb-cat-sev-${sev}`}>{DOTS[sev]}</span>
              <span className="bb-cat-tkr">{it.symbol ?? '—'}</span>
              <span className="bb-cat-msg">{it.title}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
