/**
 * SATEX — AI Insights Panel
 * Computed indicators, signal bias, EMA stack, RSI/VWAP gating for the focused symbol.
 * Also surfaces the AI brain rationale (local model + optional Claude opus-4-7).
 */
import { useEffect, useState } from 'react'
import { useMarketStore } from '../stores/marketStore'
import { useAccountStore } from '../stores/accountStore'
import { Ring } from '../components/Ring'
import { fmt } from '../lib/format'
import type { AiDecision } from '@shared/types'

export function AIInsightsPanel() {
  const symbol     = useMarketStore(s => s.symbol)
  const quote      = useMarketStore(s => s.quotes.get(symbol))
  const indicators = useAccountStore(s => s.indicators.get(symbol))
  const setInds    = useAccountStore(s => s.setIndicators)
  const [decision, setDecision] = useState<AiDecision | null>(null)

  useEffect(() => {
    if (!window.satex) return
    let cancelled = false
    const pull = () => {
      window.satex.getIndicators(symbol).then(snap => { if (!cancelled) setInds(symbol, snap) }).catch(() => {})
    }
    pull()
    const id = setInterval(pull, 2000)
    return () => { cancelled = true; clearInterval(id) }
  }, [symbol])

  useEffect(() => {
    if (!window.satex?.getAiDecision) return
    let cancelled = false
    setDecision(null)
    const pull = () => {
      window.satex.getAiDecision(symbol).then(d => { if (!cancelled) setDecision(d) }).catch(() => {})
    }
    pull()
    const id = setInterval(pull, 12000) // refresh AI rationale every 12s
    return () => { cancelled = true; clearInterval(id) }
  }, [symbol])

  if (!indicators || !quote) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--ink-3)', fontSize: 11 }}>
        Computing indicators…
      </div>
    )
  }

  const emaStack  = indicators.ema9 > indicators.ema21 && indicators.ema21 > indicators.ema50
  const emaBear   = indicators.ema9 < indicators.ema21 && indicators.ema21 < indicators.ema50
  const rsiBull   = indicators.rsi14 > 50 && indicators.rsi14 < 70
  const rsiBear   = indicators.rsi14 < 50 && indicators.rsi14 > 30
  const aboveVwap = quote.last > indicators.vwap

  const bullScore = (emaStack ? 2 : 0) + (rsiBull ? 1 : 0) + (aboveVwap ? 1 : 0)
  const bearScore = (emaBear  ? 2 : 0) + (rsiBear ? 1 : 0) + (!aboveVwap ? 1 : 0)
  const bias = bullScore > bearScore ? 'bullish' : bearScore > bullScore ? 'bearish' : 'neutral'
  const biasColor = bias === 'bullish' ? 'var(--bull-glow)' : bias === 'bearish' ? 'var(--bear-glow)' : 'var(--warn-glow)'
  const confidence = Math.max(bullScore, bearScore) / 4

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      <div className="ai-stream">
        <div className="head">SIGNAL · {symbol}</div>
        <div className="body" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', alignItems: 'center', gap: 14 }}>
          <Ring value={confidence * 100} label={bias.toUpperCase()} size={72} color={biasColor} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-0)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <strong>{bias}</strong> bias
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-2)', marginTop: 4, lineHeight: 1.45 }}>
              EMA stack <strong>{emaStack ? 'bullish' : emaBear ? 'bearish' : 'mixed'}</strong>. Price <strong>{aboveVwap ? 'above' : 'below'}</strong> VWAP.
              RSI <strong>{indicators.rsi14.toFixed(1)}</strong>{indicators.rsi14 > 70 ? ' (overbought)' : indicators.rsi14 < 30 ? ' (oversold)' : ''}.
            </div>
          </div>
        </div>
      </div>

      {decision && (
        <div className="ai-stream" style={{ borderColor: 'var(--accent-vermilion-soft, var(--line))' }}>
          <div className="head" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>BRAIN · {decision.bias.toUpperCase()}</span>
            <span style={{ color: 'var(--ink-3)' }}>
              score {decision.localScore.toFixed(2)} · conf {(decision.confidence * 100).toFixed(0)}%
            </span>
          </div>
          <div className="body" style={{ fontSize: 11, color: 'var(--ink-1)', lineHeight: 1.5 }}>
            {decision.llmRationale ?? <span style={{ color: 'var(--ink-3)' }}>Local model only — add Anthropic key for Claude rationale.</span>}
          </div>
        </div>
      )}

      <div className="indicator-grid">
        <IndTile label="EMA 9"     value={indicators.ema9.toFixed(2)}  hint={indicators.ema9 > indicators.ema21 ? 'bull' : 'bear'} />
        <IndTile label="EMA 21"    value={indicators.ema21.toFixed(2)} hint={indicators.ema21 > indicators.ema50 ? 'bull' : 'bear'} />
        <IndTile label="EMA 50"    value={indicators.ema50.toFixed(2)} />
        <IndTile label="VWAP"      value={indicators.vwap.toFixed(2)}  hint={aboveVwap ? 'bull' : 'bear'} />
        <IndTile label="RSI 14"    value={indicators.rsi14.toFixed(1)} hint={indicators.rsi14 > 70 ? 'bear' : indicators.rsi14 < 30 ? 'bull' : null} />
        <IndTile label="ATR 14"    value={indicators.atr14.toFixed(2)} />
        <IndTile label="TREND"     value={`${(indicators.trendStrength * 100).toFixed(0)}%`} />
        <IndTile label="VOL"       value={`${indicators.volatility.toFixed(2)}%`} hint={indicators.volatility > 1.5 ? 'bear' : null} />
      </div>

      <div style={{ fontSize: 10, color: 'var(--ink-3)', display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: aboveVwap ? 'var(--bull-glow)' : 'var(--bear-glow)',
          boxShadow: `0 0 8px ${aboveVwap ? 'var(--bull-glow)' : 'var(--bear-glow)'}`,
        }} />
        Price {aboveVwap ? 'above' : 'below'} VWAP — {aboveVwap ? 'bullish' : 'bearish'} intraday positioning · last {fmt.px(quote.last)}
      </div>
    </div>
  )
}

function IndTile({ label, value, hint }: { label: string; value: string; hint?: 'bull' | 'bear' | null }) {
  const color = hint === 'bull' ? 'var(--bull-glow)' : hint === 'bear' ? 'var(--bear-glow)' : 'var(--ink-0)'
  return (
    <div className="indicator-tile">
      <div className="lbl">{label}</div>
      <div className="val" style={{ color }}>{value}</div>
    </div>
  )
}
