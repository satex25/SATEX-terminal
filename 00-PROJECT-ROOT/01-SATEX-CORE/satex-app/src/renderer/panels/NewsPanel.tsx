/**
 * SATEX — News & Catalysts Panel
 * Live feed of news items. Sentiment dot, kind tag, age stamp.
 */
import { useMarketStore } from '../stores/marketStore'
import type { NewsItem, NewsKind } from '@shared/types'

const KIND_TONE: Record<NewsKind, 'bull' | 'bear' | 'warn' | 'accent' | ''> = {
  breaking:  'bear',
  earnings:  'bull',
  macro:     'warn',
  flow:      'accent',
  sentiment: '',
}

function ageString(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60)   return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

function NewsRow({ item }: { item: NewsItem }) {
  const tone = KIND_TONE[item.kind]
  const sentUp = item.sentiment >= 0
  return (
    <div className="news-item">
      <div className="news-head">
        {tone ? <span className={`tag ${tone}`}>{item.kind}</span> : <span className="tag">{item.kind}</span>}
        {item.symbol && <span className="tag accent">{item.symbol}</span>}
        <span className="news-time">{ageString(Date.now() - item.publishedAt)}</span>
        <span
          aria-label={sentUp ? 'bullish sentiment' : 'bearish sentiment'}
          style={{
            width: 6, height: 6, borderRadius: '50%',
            background: sentUp ? 'var(--bull-glow)' : 'var(--bear-glow)',
            boxShadow: `0 0 8px ${sentUp ? 'var(--bull-glow)' : 'var(--bear-glow)'}`,
          }}
        />
      </div>
      <div className="news-title">{item.title}</div>
      <div className="news-meta">
        {item.source} · sentiment {item.sentiment >= 0 ? '+' : ''}{item.sentiment.toFixed(2)}
      </div>
    </div>
  )
}

export function NewsPanel() {
  const news = useMarketStore(s => s.news)
  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      {news.length === 0
        ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink-3)', fontSize: 11 }}>Awaiting news feed…</div>
        : news.map(n => <NewsRow key={n.id} item={n} />)
      }
    </div>
  )
}
