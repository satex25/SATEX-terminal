// SATEX side panels — Watchlist, L2 Depth, Regime, Execution Ticket, Top/Bottom bars.

const { useState: useStateP, useEffect: useEffectP, useMemo: useMemoP } = React;

// -- Sparkline mini ---------------------------------------------------------
function Spark({ seed = 1, w = 56, h = 14, chg = 0 }) {
  const pts = useMemoP(() => {
    let v = 50, out = [];
    let s = seed;
    for (let i = 0; i < 24; i++) {
      s = (s * 9301 + 49297) % 233280;
      const r = (s / 233280 - 0.5);
      v += r * 6 + (chg * 0.05);
      out.push(v);
    }
    return out;
  }, [seed, chg]);
  const min = Math.min(...pts), max = Math.max(...pts);
  const path = pts.map((v, i) => `${(i / (pts.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * h}`).join(' ');
  const color = chg >= 0 ? 'var(--pos)' : 'var(--neg)';
  return (
    <svg width={w} height={h} style={{ display: 'block', opacity: 0.7 }}>
      <polyline points={path} fill="none" stroke={color} strokeWidth="1" />
    </svg>
  );
}

// -- Top bar ---------------------------------------------------------------
function Dragonfly({ size = 22 }) {
  // Silhouette dragonfly: head with compound eyes, thorax, four swept wings
  // (forewings + hindwings), long segmented abdomen. Drawn at 28-unit viewbox
  // for crisp edges at any size, anchored in a red rounded square mark.
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" style={{ display: 'block', flexShrink: 0 }}>
      <rect x="0" y="0" width="28" height="28" rx="3.4" fill="#e23744" />
      <g fill="#ffffff">
        {/* head — wide oval with two compound eyes */}
        <ellipse cx="14" cy="4.4" rx="2.4" ry="1.5" />
        {/* thorax */}
        <ellipse cx="14" cy="7.6" rx="1.7" ry="2" />
        {/* forewings — swept slightly forward, long & narrow */}
        <path d="M14 6.8 Q5 5, 1 7.6 Q5 9, 14 8.4 Z" />
        <path d="M14 6.8 Q23 5, 27 7.6 Q23 9, 14 8.4 Z" />
        {/* hindwings — slightly larger, swept back */}
        <path d="M14 9 Q4.5 9.8, 1 12.4 Q5 12, 14 10.6 Z" />
        <path d="M14 9 Q23.5 9.8, 27 12.4 Q23 12, 14 10.6 Z" />
        {/* abdomen — long tapered segmented body */}
        <path d="M13.2 10.6 L14.8 10.6 L14.55 24.6 L13.45 24.6 Z" />
      </g>
      {/* segment notches in the abdomen — red bleed-through */}
      <g fill="#e23744">
        <rect x="13.2" y="13.4" width="1.7" height="0.5" />
        <rect x="13.2" y="15.7" width="1.65" height="0.5" />
        <rect x="13.2" y="18.0" width="1.6"  height="0.5" />
        <rect x="13.2" y="20.3" width="1.55" height="0.5" />
        <rect x="13.2" y="22.6" width="1.5"  height="0.5" />
      </g>
    </svg>
  );
}

function TopBar({ session, paperLive, setSession, nowUTC, nowCST, accent }) {
  return (
    <div style={{ height: 40, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 16, background: 'var(--bg)' }}>
      {/* logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Dragonfly size={20} />
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
          <span style={{ fontWeight: 700, letterSpacing: '0.18em', fontSize: 12 }}>SATEX</span>
          <span style={{ color: 'var(--txt-mute)', fontSize: 8.5, letterSpacing: '0.18em', marginTop: 2 }}>v0.5.0 · 取引端末</span>
        </div>
      </div>

      <span style={{ width: 1, background: 'var(--line)', alignSelf: 'stretch', margin: '8px 0' }} />

      {/* file menu */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {['File', 'View', 'Markets', 'Workspace', 'Help'].map(m => (
          <span key={m} style={{ color: 'var(--txt-dim)', fontSize: 11, cursor: 'pointer' }}>{m}</span>
        ))}
      </div>

      <span style={{ width: 1, background: 'var(--line)', alignSelf: 'stretch', margin: '8px 0' }} />

      {/* workspace tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ color: 'var(--txt-mute)', fontSize: 9, letterSpacing: '0.18em' }}>WORKSPACE</span>
        {[
          { id: 'trade', label: 'Trade' },
          { id: 'focus', label: 'Focus' },
          { id: 'markets', label: 'Markets' },
          { id: 'replay', label: 'Replay' },
          { id: 'quad', label: 'Quad', active: true },
        ].map(t => (
          <span key={t.id} style={{
            color: t.active ? accent : 'var(--txt-dim)',
            borderBottom: t.active ? `1px solid ${accent}` : '1px solid transparent',
            padding: '4px 2px',
            fontSize: 11,
            letterSpacing: '0.04em',
            cursor: 'pointer',
          }}>{t.label}</span>
        ))}
      </div>

      <span style={{ flex: 1 }} />

      {/* command palette */}
      <div style={{ display: 'flex', alignItems: 'center', height: 22, padding: '0 10px', background: 'var(--surf-1)', minWidth: 260 }}>
        <span style={{ color: 'var(--txt-mute)', fontSize: 10 }}>›</span>
        <span style={{ color: 'var(--txt-dim)', fontSize: 11, marginLeft: 8 }}>buy 100 nvda lmt 962.40</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: 'var(--txt-mute)', fontSize: 9.5 }}>⌘K</span>
      </div>

      {/* session selector */}
      <SessionPill session={session} setSession={setSession} accent={accent} />

      {/* paper · live */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: 'var(--txt-mute)', fontSize: 9.5, letterSpacing: '0.12em' }}>PAPER</span>
        <span style={{ background: paperLive === 'live' ? 'var(--pos)' : 'var(--warn)', color: '#000', fontSize: 9.5, padding: '2px 6px', fontWeight: 700, letterSpacing: '0.12em' }}>{paperLive.toUpperCase()}</span>
      </div>

      {/* status indicators */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Pill dot="var(--pos)"  label="AUTO"  v="0 / 0" />
        <Pill dot={accent}      label="INTEL" v="2026" />
        <Pill dot="var(--warn)" label="LAT"   v="14ms" />
      </div>

      {/* clocks: CST + UTC */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.05, minWidth: 96 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ color: 'var(--txt)', fontSize: 13, fontWeight: 600, letterSpacing: '0.04em' }}>{nowCST}</span>
          <span style={{ color: 'var(--txt-mute)', fontSize: 9, letterSpacing: '0.16em' }}>CST</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 1 }}>
          <span style={{ color: 'var(--txt-dim)', fontSize: 10 }}>{nowUTC}</span>
          <span style={{ color: 'var(--txt-mute)', fontSize: 9, letterSpacing: '0.16em' }}>UTC</span>
        </div>
      </div>
    </div>
  );
}

function Pill({ dot, label, v }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 6, height: 6, background: dot, borderRadius: '50%' }} />
      <span style={{ color: 'var(--txt-mute)', fontSize: 9.5, letterSpacing: '0.12em' }}>{label}</span>
      <span style={{ color: 'var(--txt-dim)', fontSize: 10 }}>{v}</span>
    </div>
  );
}

function SessionPill({ session, accent }) {
  const icon = session === 'TOKYO' ? '◐' : session === 'LONDON' ? '◑' : '◔';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', background: 'var(--surf-1)' }}>
      <span style={{ color: accent, fontSize: 11 }}>{icon}</span>
      <span style={{ color: 'var(--txt)', fontSize: 10.5, letterSpacing: '0.14em', fontWeight: 600 }}>{session}</span>
      <span style={{ color: 'var(--txt-mute)', fontSize: 9 }}>SESSION</span>
    </div>
  );
}

// -- Ticker tape -----------------------------------------------------------
function TickerTape({ items }) {
  return (
    <div style={{ height: 26, overflow: 'hidden', whiteSpace: 'nowrap', background: 'var(--bg-deep)', position: 'relative', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
      <div style={{
        display: 'inline-block',
        animation: 'tickerScroll 80s linear infinite',
        paddingTop: 7,
      }}>
        {[...items, ...items, ...items].map((it, i) => {
          const [sym, val, ch] = it.split(' ');
          const up = !ch.startsWith('-');
          return (
            <span key={i} style={{ padding: '0 22px', fontSize: 11 }}>
              <span style={{ color: 'var(--txt)', fontWeight: 600, letterSpacing: '0.04em' }}>{sym}</span>
              <span style={{ color: 'var(--txt-dim)', marginLeft: 8 }}>{val}</span>
              <span style={{ color: up ? 'var(--pos)' : 'var(--neg)', marginLeft: 8 }}>{up ? '+' : ''}{ch}</span>
            </span>
          );
        })}
      </div>
      <style>{`@keyframes tickerScroll { from { transform: translateX(0); } to { transform: translateX(-33.333%); } }`}</style>
    </div>
  );
}

// -- Watchlist -------------------------------------------------------------
function Watchlist({ accent, session }) {
  const [filter, setFilter] = useStateP('');
  return (
    <div style={{ background: 'var(--surf-1)', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PanelHead title="WATCHLIST" right={<span style={{ color: 'var(--txt-mute)' }}>{session === 'LONDON' ? 'FX' : session === 'TOKYO' ? 'ASIA' : 'US'}</span>} />
      <div style={{ padding: '4px 10px 6px' }}>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter…"
          style={{
            width: '100%', background: 'var(--surf-1)', border: 'none', outline: 'none',
            color: 'var(--txt)', fontFamily: 'inherit', fontSize: 10.5, padding: '4px 8px',
          }}
        />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: 6 }}>
        {SX.watchlist.map(g => (
          <div key={g.group}>
            <div style={{ display: 'flex', padding: '6px 10px 3px', alignItems: 'baseline' }}>
              <span style={{ color: 'var(--txt-mute)', fontSize: 8.5, letterSpacing: '0.2em', flex: 1, whiteSpace: 'nowrap' }}>{g.group}</span>
              <span style={{ color: 'var(--txt-mute)', fontSize: 9 }}>{g.items.length}</span>
            </div>
            {g.items.filter(it => !filter || it.sym.toLowerCase().includes(filter.toLowerCase())).map(it => (
              <div key={it.sym} style={{
                display: 'grid',
                gridTemplateColumns: '54px 1fr 36px',
                alignItems: 'center',
                gap: 4,
                padding: '3px 10px',
                background: it.sym === 'NVDA' ? 'rgba(0,200,255,0.05)' : 'transparent',
                borderLeft: it.sym === 'NVDA' ? `2px solid ${accent}` : '2px solid transparent',
                cursor: 'pointer',
              }}>
                <div style={{ color: 'var(--txt)', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.02em' }}>{it.sym}</div>
                <div style={{ textAlign: 'right', overflow: 'hidden' }}>
                  <div style={{
                    color: it._flash === 'up' ? 'var(--pos)' : it._flash === 'dn' ? 'var(--neg)' : 'var(--txt)',
                    fontSize: 10.5,
                    transition: 'color 600ms ease-out',
                    fontVariantNumeric: 'tabular-nums',
                  }}>{it.last.toLocaleString('en-US', { minimumFractionDigits: it.last < 10 ? 4 : 2 })}</div>
                </div>
                <div style={{ textAlign: 'right', color: it.chg >= 0 ? 'var(--pos)' : 'var(--neg)', fontSize: 9.5, fontVariantNumeric: 'tabular-nums' }}>
                  {it.chg >= 0 ? '+' : ''}{it.chg.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// -- Panel head -------------------------------------------------------------
function PanelHead({ title, right }) {
  return (
    <div style={{ padding: '8px 10px 6px', display: 'flex', alignItems: 'baseline' }}>
      <span style={{ color: 'var(--txt)', fontSize: 10, letterSpacing: '0.22em', fontWeight: 600 }}>{title}</span>
      <span style={{ flex: 1 }} />
      <span style={{ fontSize: 9.5, color: 'var(--txt-mute)', letterSpacing: '0.12em' }}>{right}</span>
    </div>
  );
}

// -- L2 Depth ---------------------------------------------------------------
function DepthBook({ accent }) {
  const { asks, bids, mid } = SX.book;
  const showAsks = asks.slice(0, 7);
  const showBids = bids.slice(0, 7);
  const maxTot = Math.max(showAsks[showAsks.length-1].tot, showBids[showBids.length-1].tot);
  return (
    <div style={{ background: 'var(--surf-1)', overflow: 'hidden' }}>
      <PanelHead title="DEPTH · L2" right={<span>NBBO · NSDQ · ARCA · BATS</span>} />
      <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr 60px 60px', padding: '4px 10px 2px', color: 'var(--txt-mute)', fontSize: 9.5, letterSpacing: '0.12em' }}>
        <span>PX</span><span /><span style={{ textAlign: 'right' }}>SIZE</span><span style={{ textAlign: 'right' }}>TOT</span>
      </div>
      {[...showAsks].reverse().map(r => (
        <BookRow key={'a'+r.p} {...r} side="ask" maxTot={maxTot} />
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', padding: '4px 10px', gap: 6 }}>
        <span style={{ height: 1, background: accent, opacity: 0.4 }} />
        <span style={{ color: accent, fontSize: 11, fontWeight: 700 }}>{mid.toFixed(2)}</span>
        <span style={{ color: 'var(--txt-mute)', fontSize: 9.5, textAlign: 'right' }}>SPR 0.01 · VPIN 0.18</span>
      </div>
      {showBids.map(r => (
        <BookRow key={'b'+r.p} {...r} side="bid" maxTot={maxTot} />
      ))}
    </div>
  );
}

function BookRow({ p, size, tot, side, maxTot }) {
  const pct = (tot / maxTot) * 100;
  const color = side === 'ask' ? 'var(--neg)' : 'var(--pos)';
  return (
    <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '52px 1fr 60px 60px', padding: '2px 10px', alignItems: 'center', fontSize: 11 }}>
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: color, opacity: 0.08 }} />
      <span style={{ color, position: 'relative' }}>{p.toFixed(2)}</span>
      <span />
      <span style={{ color: 'var(--txt-dim)', textAlign: 'right', position: 'relative' }}>{size.toLocaleString()}</span>
      <span style={{ color: 'var(--txt-mute)', textAlign: 'right', position: 'relative' }}>{tot.toLocaleString()}</span>
    </div>
  );
}

// -- Regime Dashboard (replaces Bullish Bias) ------------------------------
function RegimeDashboard({ accent }) {
  const r = SX.regime;
  return (
    <div style={{ background: 'var(--surf-1)', overflow: 'hidden' }}>
      <PanelHead title="REGIME ANALYSIS" right={<span>HMM · 4-STATE · 30D</span>} />
      <div style={{ padding: '2px 10px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ color: accent, fontSize: 9.5 }}>● STATE</span>
          <span style={{ color: 'var(--txt)', fontSize: 12, fontWeight: 600, letterSpacing: '0.04em' }}>{r.state}</span>
        </div>
        <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px 14px' }}>
          <RegimeMetric label="LIQUIDITY" v={r.liquidity.v} sub={r.liquidity.label} trend={r.liquidity.trend} accent={accent} />
          <RegimeMetric label="SPREAD COST" v={r.spread.v} sub={r.spread.label} trend={r.spread.trend} invert accent={accent} />
          <RegimeMetric label="VOLATILITY" v={r.volatility.v} sub={r.volatility.label} trend={r.volatility.trend} accent={accent} />
          <RegimeMetric label="TREND STRENGTH" v={r.trend.v} sub={r.trend.label} trend={r.trend.trend} accent={accent} />
        </div>

        {/* HMM state probabilities */}
        <div style={{ marginTop: 8, color: 'var(--txt-mute)', fontSize: 9.5, letterSpacing: '0.18em' }}>STATE PROB · HMM</div>
        <div style={{ marginTop: 3 }}>
          {r.hmm.map((s, i) => (
            <div key={s.name} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 30px', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span style={{ color: i === 0 ? 'var(--txt)' : 'var(--txt-dim)', fontSize: 10 }}>{s.name}</span>
              <div style={{ height: 3, background: 'rgba(255,255,255,0.04)', position: 'relative' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${s.p * 100}%`, background: i === 0 ? accent : 'var(--txt-mute)' }} />
              </div>
              <span style={{ color: 'var(--txt-dim)', fontSize: 10, textAlign: 'right' }}>{(s.p * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RegimeMetric({ label, v, sub, trend, invert, accent }) {
  const good = invert ? trend < 0 : trend > 0;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ color: 'var(--txt-mute)', fontSize: 9.5, letterSpacing: '0.14em' }}>{label}</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: good ? 'var(--pos)' : 'var(--neg)', fontSize: 9.5 }}>{trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(2)}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
        <span style={{ color: 'var(--txt)', fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>{v.toFixed(2)}</span>
        <span style={{ color: 'var(--txt-dim)', fontSize: 10 }}>{sub}</span>
      </div>
      {/* slim bar */}
      <div style={{ height: 2, background: 'rgba(255,255,255,0.05)', marginTop: 4 }}>
        <div style={{ height: '100%', width: `${v * 100}%`, background: accent }} />
      </div>
    </div>
  );
}

// -- Execution Ticket ------------------------------------------------------
function ExecTicket({ accent }) {
  const [side, setSide] = useStateP('BUY');
  const [type, setType] = useStateP('MKT');
  const [qty, setQty] = useStateP(100);
  const pos = side === 'BUY';
  const lastPx = SX.quadData[0].series[SX.quadData[0].series.length - 1].c;
  const notional = (qty * lastPx).toLocaleString('en-US', { maximumFractionDigits: 0 });
  return (
    <div style={{ background: 'var(--surf-1)', overflow: 'hidden' }}>
      <PanelHead title="EXEC · ORDER TICKET" right={<span>NVDA · {lastPx.toFixed(2)} · NBBO</span>} />
      <div style={{ padding: '2px 10px 8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 2 }}>
          <Tab v="BUY"  active={pos}  onClick={() => setSide('BUY')}  color="var(--pos)" />
          <Tab v="SELL" active={!pos} onClick={() => setSide('SELL')} color="var(--neg)" />
          {['MKT','LMT','STP'].map(t => (
            <Tab key={t} v={t} active={type === t} onClick={() => setType(t)} color={accent} small />
          ))}
        </div>

        <Row label="QTY">
          <input value={qty} onChange={(e) => setQty(e.target.value)} style={inputStyle} />
          <Chips values={[1, 100, 500, 1000]} v={qty} setV={setQty} />
        </Row>
        <Row label="PX">
          <input value={lastPx.toFixed(2)} readOnly style={inputStyle} />
          <span style={{ color: 'var(--txt-mute)', fontSize: 10 }}>mid · 1-click</span>
        </Row>
        <Row label="ALGO">
          <select style={{ ...inputStyle, paddingRight: 14 }}>
            <option>Almgren-Chriss · η 0.4</option>
            <option>VWAP · slice 20%</option>
            <option>POV · 8%</option>
            <option>IOC · cross-spread</option>
          </select>
        </Row>

        {/* preview */}
        <div style={{ marginTop: 6, padding: '6px 8px', background: 'var(--bg-deep)', fontSize: 10.5 }}>
          <PreviewRow k="NOTIONAL" v={`$${notional}`}  />
          <PreviewRow k="BP USED"   v="$199,779" />
          <PreviewRow k="EST SLIP"  v="0.4 bp · 1 tick" />
          <PreviewRow k="RISK GATE" v={<span style={{ color: 'var(--pos)' }}>● PASS · 5/5</span>} />
        </div>

        <button style={{
          marginTop: 6, width: '100%', background: pos ? 'var(--pos)' : 'var(--neg)',
          color: '#000', fontFamily: 'inherit', fontWeight: 700, letterSpacing: '0.14em',
          fontSize: 11.5, padding: '9px', border: 'none', cursor: 'pointer',
        }}>
          {type} {side} {qty} NVDA
        </button>
      </div>
    </div>
  );
}

function Tab({ v, active, onClick, color, small }) {
  return (
    <button onClick={onClick} style={{
      background: active ? color : 'transparent',
      color: active ? '#000' : 'var(--txt-dim)',
      fontFamily: 'inherit',
      fontWeight: active ? 700 : 500,
      fontSize: small ? 10 : 11.5,
      letterSpacing: small ? '0.1em' : '0.14em',
      padding: small ? '5px 0' : '7px 0',
      border: '1px solid ' + (active ? color : 'rgba(255,255,255,0.06)'),
      cursor: 'pointer',
    }}>{v}</button>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '40px 90px 1fr', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 11 }}>
      <span style={{ color: 'var(--txt-mute)', fontSize: 9.5, letterSpacing: '0.14em' }}>{label}</span>
      {children}
    </div>
  );
}

const inputStyle = {
  background: 'var(--bg-deep)', border: 'none', outline: 'none',
  color: 'var(--txt)', fontFamily: 'inherit', fontSize: 11, padding: '6px 8px', width: '100%',
};

function Chips({ values, v, setV }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {values.map(x => (
        <button key={x} onClick={() => setV(x)} style={{
          background: +v === x ? 'rgba(0,200,255,0.18)' : 'var(--bg-deep)',
          color: +v === x ? 'var(--accent)' : 'var(--txt-dim)',
          border: 'none', fontFamily: 'inherit', fontSize: 10, padding: '5px 8px', cursor: 'pointer',
        }}>{x.toLocaleString()}</button>
      ))}
    </div>
  );
}

function PreviewRow({ k, v }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: 'var(--txt-dim)' }}>
      <span style={{ color: 'var(--txt-mute)', letterSpacing: '0.12em', fontSize: 9.5 }}>{k}</span>
      <span style={{ color: 'var(--txt)' }}>{v}</span>
    </div>
  );
}

// -- Catalysts ------------------------------------------------------------
function Catalysts() {
  // Generate timestamps anchored to "now" so feed always looks fresh.
  const items = React.useMemo(() => {
    const now = new Date();
    const offset = (mins) => {
      const d = new Date(now.getTime() - mins * 60_000);
      return d.toISOString().slice(11, 19);
    };
    return [
      { mins: 0,  ...SX.catalysts[0] },
      { mins: 2,  ...SX.catalysts[1] },
      { mins: 5,  ...SX.catalysts[2] },
      { mins: 9,  ...SX.catalysts[3] },
      { mins: 14, ...SX.catalysts[4] },
    ].map(it => ({ ...it, t: offset(it.mins) }));
  }, [Math.floor(Date.now() / 30000)]);

  return (
    <div style={{ background: 'var(--surf-1)', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <PanelHead title="CATALYSTS · LIVE" right={<span>SEV ▲ · last 60m</span>} />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {items.map((c, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 22px 56px 1fr', gap: 8, padding: '4px 10px', alignItems: 'baseline', fontSize: 10.5 }}>
            <span style={{ color: 'var(--txt-mute)', fontSize: 10 }}>{c.t}</span>
            <span style={{
              color: c.sev === 'high' ? 'var(--neg)' : c.sev === 'med' ? 'var(--warn)' : 'var(--txt-mute)',
              fontSize: 10, letterSpacing: '0.1em',
            }}>{c.sev === 'high' ? '●●●' : c.sev === 'med' ? '●●' : '●'}</span>
            <span style={{ color: 'var(--txt)', fontWeight: 600 }}>{c.tkr}</span>
            <span style={{ color: 'var(--txt-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// -- Bottom: P&L, risk metrics, system logs --------------------------------
function BottomBar({ accent }) {
  return (
    <div style={{ height: 30, background: 'var(--bg)', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 18, borderTop: '1px solid var(--line)', fontSize: 10.5 }}>
      <BotItem k="P&L · TODAY"  v={<span style={{ color: 'var(--neg)' }}>−$100,000</span>} />
      <BotItem k="EQUITY"      v="$0" />
      <BotItem k="BP"           v="$199,779" />
      <BotItem k="VaR 95"       v="$2,140 / 12k tgt" warn />
      <BotItem k="LIQ DEPTH"    v="top-of-book · ok" />
      <BotItem k="EXPOSURE"     v="−12.4% · 3 names" />
      <BotItem k="CVD"          v="buy-init bias" />
      <BotItem k="SLIPPAGE"     v="1.4 bp · good" />
      <BotItem k="SHARPE"       v="2.10 · rolling" />
      <BotItem k="GROSS · NET"  v="0.0% of equity" />
      <span style={{ flex: 1 }} />
      <BotItem k="DXY"          v={<><span style={{ color: 'var(--txt)' }}>102.41</span> <span style={{ color: 'var(--pos)' }}>+0.12</span></>} />
      <BotItem k="TNX"          v={<><span style={{ color: 'var(--txt)' }}>4.21%</span> <span style={{ color: 'var(--neg)' }}>−0.03</span></>} />
      <BotItem k="LOG"          v={<span style={{ color: accent }}>● tape · ok</span>} />
    </div>
  );
}

function BotItem({ k, v, warn }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
      <span style={{ color: 'var(--txt-mute)', letterSpacing: '0.14em', fontSize: 9.5 }}>{k}</span>
      <span style={{ color: warn ? 'var(--warn)' : 'var(--txt-dim)' }}>{v}</span>
    </span>
  );
}

Object.assign(window, {
  TopBar, TickerTape, Watchlist, DepthBook, RegimeDashboard, ExecTicket, Catalysts, BottomBar, Spark,
});
