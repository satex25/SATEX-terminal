// SATEX Terminal v0.6.0 — Tab-routed shell. Persistent left rail (watchlist),
// right rail (depth + regime + exec), and bottom row (portfolio · risk ·
// positions · logs). The CENTER swaps based on the active workspace tab.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme":        "classic",
  "showEMA9":     true,
  "showEMA21":    true,
  "showVWAP":     true,
  "showRSI":      true,
  "chartGrid":    "minimal",
  "tickRate":     "1s",
  "startTab":     "quad"
}/*EDITMODE-END*/;

const THEMES = {
  classic: { pos: '#21c97a', neg: '#ff4655', ema9: '#f5c46a', ema21: '#b48cff', accent: '#00c8ff', label: 'Classic' },
  mono:    { pos: '#f0f0f4', neg: '#8a8a92', ema9: '#c8c8d0', ema21: '#7a7a84', accent: '#cfcfd4', label: 'Mono' },
  bluyel:  { pos: '#3b9eff', neg: '#f5c542', ema9: '#ffd86b', ema21: '#69b8ff', accent: '#3b9eff', label: 'Blue/Yellow' },
};

function applyTheme(name) {
  const t = THEMES[name] || THEMES.classic;
  const r = document.documentElement.style;
  r.setProperty('--pos',    t.pos);
  r.setProperty('--neg',    t.neg);
  r.setProperty('--ema9',   t.ema9);
  r.setProperty('--ema21',  t.ema21);
  r.setProperty('--accent', t.accent);
}

function useLiveTick() {
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    SX.tickEngine.start();
    const off = SX.tickEngine.subscribe(() => setTick(t => t + 1));
    return off;
  }, []);
  return tick;
}

function useClocks() {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const utc = now.toISOString().slice(11, 19);
  const cstDate = new Date(now.getTime() - 6 * 3600 * 1000);
  const cst = cstDate.toISOString().slice(11, 19);
  const utcHour = now.getUTCHours();
  return { utc, cst, utcHour };
}

const TAB_LABELS = {
  workspace: { label: 'Workspace', cap: 'WORKSPACE' },
  trade:     { label: 'Trade',     cap: 'TRADE' },
  focus:     { label: 'Focus',     cap: 'FOCUS' },
  markets:   { label: 'Markets',   cap: 'MARKETS' },
  replay:    { label: 'Replay',    cap: 'REPLAY' },
  quad:      { label: 'Quad',      cap: 'QUAD' },
};

function Terminal() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const tick = useLiveTick();
  const { utc, cst, utcHour } = useClocks();
  const session = SX.sessionFor(utcHour);
  const [tab, setTab] = React.useState(t.startTab || 'quad');
  const [perChartInd, setPerChartInd] = React.useState({}); // { NVDA: {ema9:true, ema21:false, vwap:true} }

  React.useEffect(() => { applyTheme(t.theme); }, [t.theme]);
  const theme = THEMES[t.theme] || THEMES.classic;
  const accent = theme.accent;
  const ticker = SX.tickers[session];

  // Decide which right rail variant to show. Some tabs (markets, replay)
  // benefit from the same right rail — it's information that quants want
  // visible at all times. We keep it consistent across all views.
  const showRightRail = true;

  // Layout: top bar + ticker + main + secondary row + catalysts ticker + bottom bar
  return (
    <div style={{
      display: 'grid',
      gridTemplateRows: '40px 26px minmax(0, 1fr) 152px 24px 30px',
      height: '100%',
      gap: 0,
      overflow: 'hidden',
    }}>
      <TopBarV3
        tab={tab} setTab={setTab}
        session={session} paperLive="live"
        nowUTC={utc} nowCST={cst} accent={accent}
      />
      <TickerTape items={ticker} />

      {/* main */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: showRightRail ? '200px 1px 1fr 1px 340px' : '200px 1px 1fr',
        gridTemplateRows: 'minmax(0, 1fr)',
        gap: 0,
        minHeight: 0,
        overflow: 'hidden',
        background: 'var(--surf-1)',
      }}>
        <Watchlist accent={accent} session={session} />
        <div style={{ background: 'var(--line)' }} />

        {/* center — swaps based on tab */}
        <CenterRouter
          tab={tab} setTab={setTab}
          accent={accent} chartOpts={t}
          perChartInd={perChartInd} setPerChartInd={setPerChartInd}
          cst={cst}
        />

        {showRightRail && <div style={{ background: 'var(--line)' }} />}
        {showRightRail && (
          <div style={{ display: 'grid', gridTemplateRows: '288px 1px 268px 1px minmax(0, 1fr)', minHeight: 0, overflow: 'hidden' }}>
            <DepthBook accent={accent} />
            <div style={{ background: 'var(--line)' }} />
            <RegimeDashboard accent={accent} />
            <div style={{ background: 'var(--line)' }} />
            <ExecTicket accent={accent} />
          </div>
        )}
      </div>

      {/* secondary row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '200px 1px 1fr 1px 1fr 1px 340px',
        gridTemplateRows: 'minmax(0, 1fr)',
        gap: 0,
        background: 'var(--surf-1)',
        borderTop: '1px solid var(--line)',
        minHeight: 0, overflow: 'hidden',
      }}>
        <PortfolioMini accent={accent} />
        <div style={{ background: 'var(--line)' }} />
        <RiskGate accent={accent} />
        <div style={{ background: 'var(--line)' }} />
        <PositionsMini accent={accent} />
        <div style={{ background: 'var(--line)' }} />
        <SystemLogs accent={accent} nowUTC={utc} />
      </div>

      <CatalystsTicker accent={accent} />
      <BottomBar accent={accent} />

      <SatexTweaks t={t} setTweak={setTweak} tab={tab} setTab={setTab} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CenterRouter — picks the page view based on active tab.
// ---------------------------------------------------------------------------
function CenterRouter({ tab, setTab, accent, chartOpts, perChartInd, setPerChartInd, cst }) {
  switch (tab) {
    case 'workspace': return <WorkspaceView accent={accent} chartOpts={chartOpts} perChartInd={perChartInd} setPerChartInd={setPerChartInd} />;
    case 'trade':     return <TradeView     accent={accent} chartOpts={chartOpts} perChartInd={perChartInd} setPerChartInd={setPerChartInd} />;
    case 'focus':     return <FocusView     accent={accent} chartOpts={chartOpts} perChartInd={perChartInd} setPerChartInd={setPerChartInd} />;
    case 'markets':   return <MarketsView   accent={accent} />;
    case 'replay':    return <ReplayView    accent={accent} chartOpts={chartOpts} perChartInd={perChartInd} setPerChartInd={setPerChartInd} />;
    case 'quad':
    default:          return <QuadView      accent={accent} chartOpts={chartOpts} perChartInd={perChartInd} setPerChartInd={setPerChartInd} />;
  }
}

// ---------------------------------------------------------------------------
// TopBarV3 — same chrome but workspace tabs now route. Active tab highlighted
// with a wider underline + accent text; whole tab area is clickable.
// ---------------------------------------------------------------------------
function TopBarV3({ tab, setTab, session, nowUTC, nowCST, accent, paperLive }) {
  return (
    <div style={{ height: 40, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 16, background: 'var(--bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Dragonfly size={20} />
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
          <span style={{ fontWeight: 700, letterSpacing: '0.18em', fontSize: 12 }}>SATEX</span>
          <span style={{ color: 'var(--txt-mute)', fontSize: 8.5, letterSpacing: '0.18em', marginTop: 2 }}>v0.6.0 · 取引端末</span>
        </div>
      </div>

      <span style={{ width: 1, background: 'var(--line)', alignSelf: 'stretch', margin: '8px 0' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {['File', 'View', 'Markets', 'Help'].map(m => (
          <span key={m} style={{ color: 'var(--txt-dim)', fontSize: 11, cursor: 'pointer' }}>{m}</span>
        ))}
      </div>

      <span style={{ width: 1, background: 'var(--line)', alignSelf: 'stretch', margin: '8px 0' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ color: 'var(--txt-mute)', fontSize: 9, letterSpacing: '0.18em', marginRight: 10 }}>WORKSPACE</span>
        {Object.keys(TAB_LABELS).filter(k => k !== 'workspace').concat(['workspace']).slice(0, 5).concat(['workspace']) /* no-op for ordering */ , null}
        {[
          { id: 'trade',     label: 'Trade'     },
          { id: 'focus',     label: 'Focus'     },
          { id: 'markets',   label: 'Markets'   },
          { id: 'replay',    label: 'Replay'    },
          { id: 'quad',      label: 'Quad'      },
        ].map(x => {
          const active = tab === x.id;
          return (
            <button key={x.id} onClick={() => setTab(x.id)} style={{
              background: 'transparent',
              color: active ? accent : 'var(--txt-dim)',
              borderBottom: active ? `2px solid ${accent}` : '2px solid transparent',
              borderTop: 'none', borderLeft: 'none', borderRight: 'none',
              padding: '6px 8px 4px', fontFamily: 'inherit',
              fontSize: 11, letterSpacing: '0.04em',
              fontWeight: active ? 600 : 400, cursor: 'pointer',
            }}>{x.label}</button>
          );
        })}
      </div>

      <span style={{ flex: 1 }} />

      <div style={{ display: 'flex', alignItems: 'center', height: 22, padding: '0 10px', background: 'var(--surf-1)', minWidth: 260 }}>
        <span style={{ color: 'var(--txt-mute)', fontSize: 10 }}>›</span>
        <span style={{ color: 'var(--txt-dim)', fontSize: 11, marginLeft: 8 }}>buy 100 nvda lmt 962.40</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: 'var(--txt-mute)', fontSize: 9.5 }}>⌘K</span>
      </div>

      <SessionPill session={session} accent={accent} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: 'var(--txt-mute)', fontSize: 9.5, letterSpacing: '0.12em' }}>PAPER</span>
        <span style={{ background: paperLive === 'live' ? 'var(--pos)' : 'var(--warn)', color: '#000', fontSize: 9.5, padding: '2px 6px', fontWeight: 700, letterSpacing: '0.12em' }}>{paperLive.toUpperCase()}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Pill dot="var(--pos)"  label="AUTO"  v="0 / 0" />
        <Pill dot={accent}      label="INTEL" v="2026" />
        <Pill dot="var(--warn)" label="LAT"   v="14ms" />
      </div>

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

// ---------------------------------------------------------------------------
// MacroStrip + Catalysts ticker — repeated here so they aren't tied to the
// old terminal file. Same content, just kept self-contained.
// ---------------------------------------------------------------------------
function MacroStrip({ accent, nowCST }) {
  const events = [
    { hh: 13, mm: 30, label: 'US CPI · m/m',       cons: '+0.20%',    actual: '+0.18%', impact: 'high' },
    { hh: 14, mm:  0, label: 'BoE Mann speech',    cons: '—',         actual: '—',      impact: 'low'  },
    { hh: 14, mm: 30, label: 'Fed Williams · NY',  cons: '—',         actual: '—',      impact: 'med'  },
    { hh: 15, mm:  0, label: 'EIA Crude Stocks',   cons: '−1.8MM',    actual: '—',      impact: 'med'  },
    { hh: 16, mm:  0, label: '30Y Auction · $22B', cons: '—',         actual: '—',      impact: 'med'  },
    { hh: 21, mm:  0, label: 'NVDA · Q3 Earnings', cons: 'EPS $0.74', actual: 'AMC',    impact: 'high' },
  ];
  const fmt = (e) => `${String(e.hh).padStart(2,'0')}:${String(e.mm).padStart(2,'0')}`;
  return (
    <div style={{ height: 56, background: 'var(--surf-1)', padding: '4px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 3 }}>
        <span style={{ color: 'var(--txt)', fontSize: 9.5, letterSpacing: '0.24em', fontWeight: 600 }}>MACRO · NEXT 12H</span>
        <span style={{ color: 'var(--txt-mute)', fontSize: 9, letterSpacing: '0.12em' }}>UTC</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: accent, fontSize: 9.5, letterSpacing: '0.14em' }}>● NOW · CST {nowCST}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', columnGap: 14 }}>
        {events.map((e) => (
          <div key={e.label} style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
            <span style={{
              color: e.impact === 'high' ? 'var(--neg)' : e.impact === 'med' ? 'var(--warn)' : 'var(--txt-mute)',
              fontSize: 9, letterSpacing: '0.1em', flexShrink: 0,
            }}>{e.impact === 'high' ? '●●●' : e.impact === 'med' ? '●●' : '●'}</span>
            <span style={{ color: 'var(--txt)', fontSize: 10.5, flexShrink: 0 }}>{fmt(e)}</span>
            <span style={{ color: 'var(--txt-dim)', fontSize: 10.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{e.label}</span>
            <span style={{ color: 'var(--txt-mute)', fontSize: 9.5, whiteSpace: 'nowrap', flexShrink: 0 }}>{e.actual !== '—' ? e.actual : e.cons}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CatalystsTicker({ accent }) {
  const items = SX.catalysts;
  return (
    <div style={{
      height: 24, background: 'var(--surf-1)', borderTop: '1px solid var(--line)',
      display: 'flex', alignItems: 'center', overflow: 'hidden', position: 'relative',
    }}>
      <div style={{
        padding: '0 12px', height: '100%', display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--surf-1)', flexShrink: 0, borderRight: '1px solid var(--line)',
      }}>
        <span style={{ color: accent, fontSize: 9, letterSpacing: '0.18em', fontWeight: 600 }}>CATALYSTS</span>
        <span style={{ color: 'var(--txt-mute)', fontSize: 9, letterSpacing: '0.14em' }}>LIVE</span>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap',
          animation: 'catScroll 120s linear infinite', willChange: 'transform',
        }}>
          {[...items, ...items, ...items].map((c, i) => (
            <span key={i} style={{ padding: '0 18px', fontSize: 10.5, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                color: c.sev === 'high' ? 'var(--neg)' : c.sev === 'med' ? 'var(--warn)' : 'var(--txt-mute)',
                fontSize: 8, letterSpacing: '0.1em',
              }}>{c.sev === 'high' ? '●●●' : c.sev === 'med' ? '●●' : '●'}</span>
              <span style={{ color: 'var(--txt-mute)', fontSize: 10 }}>{c.t}</span>
              <span style={{ color: 'var(--txt)', fontWeight: 600 }}>{c.tkr}</span>
              <span style={{ color: 'var(--txt-dim)' }}>{c.msg}</span>
              <span style={{ color: 'var(--line-2)', marginLeft: 8 }}>│</span>
            </span>
          ))}
        </div>
        <style>{`@keyframes catScroll { from { transform: translateX(0); } to { transform: translateX(-33.333%); } }`}</style>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mini panels for the secondary row (portfolio/risk/positions/logs).
// ---------------------------------------------------------------------------
function PositionsMini({ accent }) {
  const positions = [
    { sym: 'NVDA', side: 'L', qty: 100,  avg: 958.21,  last: SX.quadData[0].series[SX.quadData[0].series.length - 1].c, pnl: null },
    { sym: 'SPY',  side: 'S', qty: 50,   avg: 609.42,  last: SX.quadData[1].series[SX.quadData[1].series.length - 1].c, pnl: null },
    { sym: 'ES1!', side: 'L', qty: 2,    avg: 5790.25, last: SX.quadData[2].series[SX.quadData[2].series.length - 1].c, pnl: null },
  ];
  positions.forEach(p => {
    const dir = p.side === 'L' ? 1 : -1;
    p.pnl = +(dir * (p.last - p.avg) * p.qty).toFixed(2);
    p.bp  = ((p.last - p.avg) / p.avg) * 10000 * dir;
  });
  return (
    <div style={{ background: 'var(--surf-1)', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <PanelHead title="POSITIONS" right={<span style={{ color: 'var(--pos)' }}>● 3 OPEN</span>} />
      <div style={{ padding: '0 10px 0', display: 'grid', gridTemplateColumns: '38px 18px 36px 60px 60px 1fr', columnGap: 6, color: 'var(--txt-mute)', fontSize: 9, letterSpacing: '0.12em', paddingBottom: 4 }}>
        <span>SYM</span><span></span><span>QTY</span><span style={{ textAlign: 'right' }}>AVG</span><span style={{ textAlign: 'right' }}>LAST</span><span style={{ textAlign: 'right' }}>P&L · bp</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {positions.map(p => (
          <div key={p.sym} style={{ display: 'grid', gridTemplateColumns: '38px 18px 36px 60px 60px 1fr', columnGap: 6, padding: '3px 10px', alignItems: 'baseline', fontSize: 10.5 }}>
            <span style={{ color: 'var(--txt)', fontWeight: 600 }}>{p.sym}</span>
            <span style={{ color: p.side === 'L' ? 'var(--pos)' : 'var(--neg)', fontSize: 9, letterSpacing: '0.1em' }}>{p.side}</span>
            <span style={{ color: 'var(--txt-dim)' }}>{p.qty}</span>
            <span style={{ color: 'var(--txt-dim)', textAlign: 'right' }}>{p.avg.toFixed(2)}</span>
            <span style={{ color: 'var(--txt)', textAlign: 'right', fontWeight: 600 }}>{p.last.toFixed(2)}</span>
            <span style={{ color: p.pnl >= 0 ? 'var(--pos)' : 'var(--neg)', textAlign: 'right' }}>
              {p.pnl >= 0 ? '+' : ''}{p.pnl.toFixed(0)} <span style={{ color: 'var(--txt-mute)', fontSize: 9.5 }}>{p.bp >= 0 ? '+' : ''}{p.bp.toFixed(0)}bp</span>
            </span>
          </div>
        ))}
        <div style={{ padding: '8px 10px 0', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 10 }}>
          <KV k="GROSS"  v={`$${(positions.reduce((s,p) => s + Math.abs(p.last * p.qty), 0) / 1000).toFixed(0)}k`} />
          <KV k="NET"    v={`$${(positions.reduce((s,p) => s + (p.side === 'L' ? 1 : -1) * p.last * p.qty, 0) / 1000).toFixed(0)}k`} />
          <KV k="DAY P&L" v={<span style={{ color: positions.reduce((s,p) => s + p.pnl, 0) >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
            ${positions.reduce((s,p) => s + p.pnl, 0).toFixed(0)}
          </span>} />
        </div>
      </div>
    </div>
  );
}

function KV({ k, v }) {
  return (
    <div>
      <div style={{ color: 'var(--txt-mute)', fontSize: 9, letterSpacing: '0.12em' }}>{k}</div>
      <div style={{ color: 'var(--txt)', fontSize: 11, marginTop: 1 }}>{v}</div>
    </div>
  );
}

function PortfolioMini({ accent }) {
  const pts = React.useMemo(() => {
    let s = 9, v = 0; const out = [];
    for (let i = 0; i < 80; i++) {
      s = (s * 9301 + 49297) % 233280;
      v += (s / 233280 - 0.52) * 1.6;
      out.push(v);
    }
    return out;
  }, []);
  const min = Math.min(...pts), max = Math.max(...pts);
  const W = 232, H = 100;
  const path = pts.map((v, i) => `${(i / (pts.length - 1)) * W},${H - ((v - min) / (max - min || 1)) * (H - 8) - 4}`).join(' ');
  return (
    <div style={{ background: 'var(--surf-1)', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <PanelHead title="PORTFOLIO" right={<span>PAPER</span>} />
      <div style={{ padding: '0 10px 6px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: 10.5 }}>
        <MiniKV k="EQUITY"    v="$100,000" />
        <MiniKV k="CASH"      v="$100,000" />
        <MiniKV k="DAILY P&L" v="+$0" />
        <MiniKV k="BP"        v="$200,000" />
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: '0 0 4px' }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
          <line x1="0" x2={W} y1={H/2} y2={H/2} stroke="rgba(255,255,255,0.05)" strokeDasharray="2 3" />
          <polyline points={path} fill="none" stroke="var(--pos)" strokeOpacity="0.85" strokeWidth="1.4" />
        </svg>
      </div>
    </div>
  );
}

function MiniKV({ k, v }) {
  return (
    <div>
      <div style={{ color: 'var(--txt-mute)', fontSize: 9, letterSpacing: '0.14em' }}>{k}</div>
      <div style={{ color: 'var(--txt)', fontSize: 12 }}>{v}</div>
    </div>
  );
}

function RiskGate({ accent }) {
  const gates = [
    { k: 'DAILY LOSS LIMIT',  pct: 0.0, status: 'OK',    v: '0.0% / −2.0% buf' },
    { k: 'POSITION COUNT',    pct: 0.0, status: 'OK',    v: '0 / 5 max' },
    { k: 'CONCENTRATION',     pct: 0.0, status: 'OK',    v: '— / cap 50%' },
    { k: 'GROSS LEVERAGE',    pct: 0.0, status: 'OK',    v: '0.0× / 3.0× max' },
    { k: 'CORRELATION ρ̄',    pct: 0.0, status: 'OK',    v: 'n/a · need ≥2 positions' },
    { k: 'SESSION VAR (95%)', pct: 0.0, status: 'OK',    v: 'n/a · need ≥8 snapshots (0)' },
  ];
  return (
    <div style={{ background: 'var(--surf-1)', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <PanelHead title="RISK GATES" right={<span style={{ color: 'var(--pos)' }}>● 6 OK · 0 WATCH</span>} />
      <div style={{ padding: '2px 10px 6px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px 14px', flex: 1, alignContent: 'start' }}>
        {gates.map(g => (
          <div key={g.k}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ color: 'var(--txt-mute)', fontSize: 9, letterSpacing: '0.12em', whiteSpace: 'nowrap' }}>{g.k}</span>
              <span style={{ flex: 1 }} />
              <span style={{ color: g.status === 'OK' ? 'var(--pos)' : 'var(--warn)', fontSize: 9, letterSpacing: '0.08em' }}>{g.status}</span>
            </div>
            <div style={{ color: 'var(--txt-dim)', fontSize: 10, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.v}</div>
            <div style={{ height: 2, background: 'rgba(255,255,255,0.05)', marginTop: 4 }}>
              <div style={{ height: '100%', width: `${g.pct * 100}%`, background: g.status === 'OK' ? 'var(--pos)' : 'var(--warn)' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SystemLogs({ accent, nowUTC }) {
  const lines = React.useMemo(() => {
    const now = new Date();
    const offset = (s) => new Date(now.getTime() - s * 1000).toISOString().slice(11, 19);
    return [
      { dt: 2,   lvl: 'INFO',  tag: 'tape',  msg: 'WS · NASDAQ ITCH frame OK · 1,041 msg/s' },
      { dt: 12,  lvl: 'INFO',  tag: 'algo',  msg: 'Almgren-Chriss · η 0.4 · γ 1e-6 · loaded' },
      { dt: 28,  lvl: 'WARN',  tag: 'lat',   msg: 'BATS · 22ms p99 · > 15ms threshold' },
      { dt: 41,  lvl: 'INFO',  tag: 'hmm',   msg: 'Regime · MEAN-REVERT → EXPANSION · p=0.58' },
      { dt: 58,  lvl: 'INFO',  tag: 'risk',  msg: 'Pre-trade gate · 5/5 pass · NVDA·100 MKT' },
      { dt: 74,  lvl: 'EVENT', tag: 'cat',   msg: 'Block print · 412k @ 962.18 · dark pool' },
    ].map(l => ({ ...l, t: offset(l.dt) }));
  }, [nowUTC]);
  const lvlColor = (l) => l === 'WARN' ? 'var(--warn)' : l === 'EVENT' ? accent : 'var(--txt-mute)';
  return (
    <div style={{ background: 'var(--surf-1)', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <PanelHead title="SYSTEM LOGS" right={<span>tail · last 60s</span>} />
      <div style={{ padding: '0 10px 8px', fontSize: 10.5, lineHeight: 1.5, flex: 1, overflow: 'hidden' }}>
        {lines.map((l, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 40px 40px 1fr', gap: 6, color: 'var(--txt-dim)' }}>
            <span style={{ color: 'var(--txt-mute)' }}>{l.t}</span>
            <span style={{ color: lvlColor(l.lvl), letterSpacing: '0.08em', fontSize: 9.5 }}>{l.lvl}</span>
            <span style={{ color: 'var(--txt-mute)' }}>{l.tag}</span>
            <span style={{ color: 'var(--txt-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tweaks panel — now also exposes the active tab for quick switching from
// inside the panel.
// ---------------------------------------------------------------------------
function SatexTweaks({ t, setTweak, tab, setTab }) {
  const set = (k) => (v) => setTweak(k, v);
  return (
    <TweaksPanel title="SATEX · TWEAKS">
      <TweakSection label="WORKSPACE">
        <TweakSelect label="Active tab" value={tab} onChange={setTab} options={[
          { value: 'trade',     label: 'Trade' },
          { value: 'focus',     label: 'Focus' },
          { value: 'markets',   label: 'Markets' },
          { value: 'replay',    label: 'Replay' },
          { value: 'quad',      label: 'Quad' },
        ]} />
      </TweakSection>
      <TweakSection label="COLOR SCHEME">
        <TweakRadio label="Theme" value={t.theme} onChange={set('theme')} options={[
          { value: 'classic', label: 'Classic' },
          { value: 'mono',    label: 'Mono' },
          { value: 'bluyel',  label: 'Blu/Yel' },
        ]} />
      </TweakSection>
      <TweakSection label="OVERLAYS · DEFAULT">
        <TweakToggle label="EMA 9"  value={t.showEMA9}  onChange={set('showEMA9')} />
        <TweakToggle label="EMA 21" value={t.showEMA21} onChange={set('showEMA21')} />
        <TweakToggle label="VWAP"   value={t.showVWAP}  onChange={set('showVWAP')} />
      </TweakSection>
      <TweakSection label="DATA">
        <TweakRadio label="Grid"      value={t.chartGrid} onChange={set('chartGrid')} options={[
          { value: 'minimal', label: 'Minimal' },
          { value: 'dense',   label: 'Dense' },
          { value: 'off',     label: 'Off' },
        ]} />
        <TweakRadio label="Tick rate" value={t.tickRate}  onChange={set('tickRate')} options={[
          { value: '500ms', label: '½s' },
          { value: '1s',    label: '1s' },
          { value: '5s',    label: '5s' },
        ]} />
      </TweakSection>
    </TweaksPanel>
  );
}

ReactDOM.createRoot(document.getElementById('stage')).render(<Terminal />);
