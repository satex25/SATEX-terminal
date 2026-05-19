/**
 * SATEX — Portfolio Panel
 * Account summary tiles · open positions · recent orders.
 */
import { useAccountStore } from '../stores/accountStore'
import { DEFAULT_EQUITY, DAILY_LOSS_LIMIT_PCT } from '@shared/constants'
import { fmt } from '../lib/format'

export function PortfolioPanel() {
  const account = useAccountStore(s => s.account)
  const orders  = useAccountStore(s => s.orders)

  const dailyPnl = account.dailyPnl
  const pnlUp    = dailyPnl >= 0
  const lossPct  = Math.max(0, -dailyPnl) / DEFAULT_EQUITY * 100
  const lossPctFraction = Math.min(100, (lossPct / (DAILY_LOSS_LIMIT_PCT * 100)) * 100)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      <div className="acct-grid">
        <Tile label="EQUITY"     value={fmt.usd(account.equity, 0)} />
        <Tile label="CASH"       value={fmt.usd(account.cash, 0)} />
        <Tile label="DAILY P&L"  value={fmt.money(dailyPnl, 0)} color={pnlUp ? 'var(--bull-glow)' : 'var(--bear-glow)'} />
        <Tile label="BP"         value={fmt.usd(account.buyingPower, 0)} />
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--ink-3)', letterSpacing: '0.08em', marginBottom: 4 }}>
          <span>DAILY LOSS LIMIT</span>
          <span>{lossPct.toFixed(2)}% / {(DAILY_LOSS_LIMIT_PCT * 100).toFixed(1)}%</span>
        </div>
        <div className="indicator-bar" style={{ height: 4 }}>
          <i style={{ width: `${lossPctFraction}%`, background: 'linear-gradient(90deg, var(--warn-glow), var(--bear))' }} />
        </div>
      </div>

      <div className="section-eyebrow">Positions ({account.openPositions.length})</div>
      <div style={{ overflowY: 'auto', minHeight: 60 }}>
        {account.openPositions.length === 0 ? (
          <div style={{ padding: 14, textAlign: 'center', color: 'var(--ink-3)', fontSize: 11 }}>No open positions</div>
        ) : account.openPositions.map(p => {
          const pnlPos = p.unrealizedPnl >= 0
          const long   = p.quantity >= 0
          return (
            <div className="position-row" key={p.symbol}>
              <div className="ps">
                <span className={`side ${long ? 'long' : 'short'}`}>{long ? 'LONG' : 'SHORT'}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--ink-0)' }}>{p.symbol}</div>
                  <div style={{ fontSize: 9.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
                    {Math.abs(p.quantity)} @ {fmt.usd(p.avgPrice, 2)}
                  </div>
                </div>
              </div>
              <div className="qty">{long ? '+' : '−'}{Math.abs(p.quantity)}</div>
              <div className="pnl" style={{ color: pnlPos ? 'var(--bull-glow)' : 'var(--bear-glow)' }}>
                {fmt.money(p.unrealizedPnl, 2)}
              </div>
            </div>
          )
        })}
      </div>

      {orders.length > 0 && (
        <>
          <div className="section-eyebrow">Recent Orders</div>
          <div style={{ overflowY: 'auto', minHeight: 0 }}>
            {orders.slice(0, 20).map(o => {
              const side = o.request.side
              const filled = o.status === 'filled'
              const tone = o.status === 'filled' ? 'bull' : o.status === 'rejected' ? 'bear' : 'warn'
              return (
                <div key={o.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '64px 60px 1fr auto',
                  alignItems: 'center', gap: 6,
                  padding: '5px 6px',
                  borderBottom: '1px solid var(--line)',
                  fontSize: 10,
                }}>
                  <span style={{ fontWeight: 700, color: 'var(--ink-0)' }}>{o.request.symbol}</span>
                  <span style={{ color: side === 'buy' ? 'var(--bull-glow)' : 'var(--bear-glow)', fontWeight: 700, textTransform: 'uppercase' }}>{side}</span>
                  <span className="mono" style={{ color: 'var(--ink-2)' }}>
                    {o.request.quantity} @ {filled && o.fillPrice ? fmt.usd(o.fillPrice, 2) : 'pending'}
                  </span>
                  <span className={`tag ${tone}`}>{o.status.toUpperCase()}</span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function Tile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="acct-tile">
      <div className="lbl">{label}</div>
      <div className="val" style={color ? { color } : undefined}>{value}</div>
    </div>
  )
}
