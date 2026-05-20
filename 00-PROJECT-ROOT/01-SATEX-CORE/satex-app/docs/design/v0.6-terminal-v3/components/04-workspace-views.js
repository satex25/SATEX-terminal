// SATEX page views — one per workspace tab. The Terminal shell passes a
// consistent `accent` color and tweak state; each page composes its own
// center layout while the persistent watchlist (left) and right sidebar
// (depth/regime/exec) remain in place across views.

const { useState: useStateP3, useMemo: useMemoP3, useEffect: useEffectP3 } = React;

// ---------------------------------------------------------------------------
// WORKSPACE — dense overview: 1 hero chart + 4 mini charts + heat tape.
// ---------------------------------------------------------------------------
function WorkspaceView({ accent, chartOpts, perChartInd, setPerChartInd }) {
  const [hover, setHover] = useStateP3(null);
  const hero = SX.quadData[0];
  const minis = SX.quadData.slice(1, 4);
  return (
    <div style={{ display: 'grid', gridTemplateRows: 'minmax(0,1fr) 1px 220px 1px 56px', height: '100%', background: 'var(--bg)' }}>
      {/* Hero chart */}
      <div style={{ background: 'var(--surf-1)', minHeight: 0, position: 'relative' }}>
        <ChartCanvas
          data={hero} hover={hover} onHover={setHover}
          accent={accent} chartOpts={{ ...chartOpts, onIndicatorChange: (sym, k, v) => {
            setPerChartInd(p => ({ ...p, [sym]: { ...(p[sym]||{}), [k.replace('show','').toLowerCase()]: v } }));
          }}}
          showToolbar
          size={{ w: 1240, h: 540 }}
          indicators={perChartInd[hero.sym]}
        />
      </div>
      <div style={{ background: 'var(--line)' }} />

      {/* Three mini charts side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr 1px 1fr', minHeight: 0, background: 'var(--surf-1)' }}>
        {minis.map((d, i) => (
          <React.Fragment key={d.sym}>
            <div style={{ overflow: 'hidden', position: 'relative' }}>
              <ChartCanvas
                data={d} hover={hover} onHover={setHover}
                accent={accent} chartOpts={chartOpts}
                size={{ w: 412, h: 220 }}
                indicators={perChartInd[d.sym]}
                showTimeAxis={false}
              />
            </div>
            {i < minis.length - 1 && <div style={{ background: 'var(--line)' }} />}
          </React.Fragment>
        ))}
      </div>
      <div style={{ background: 'var(--line)' }} />

      {/* Heat tape — sector strip */}
      <HeatTape accent={accent} />
    </div>
  );
}

function HeatTape({ accent }) {
  const sectors = [
    { name: 'SEMI',    chg: +1.24, w: 5 },
    { name: 'MEGA',    chg: +0.62, w: 4 },
    { name: 'CYC',     chg: +0.18, w: 3 },
    { name: 'BIOTECH', chg: +0.04, w: 3 },
    { name: 'BANKS',   chg: -0.21, w: 3 },
    { name: 'CONS',    chg: -0.34, w: 4 },
    { name: 'UTILS',   chg: -0.41, w: 2 },
    { name: 'ENERGY',  chg: -0.62, w: 3 },
    { name: 'REIT',    chg: -0.84, w: 2 },
    { name: 'GOLD',    chg: +0.41, w: 2 },
  ];
  const totalW = sectors.reduce((s,x) => s + x.w, 0);
  return (
    <div style={{ background: 'var(--surf-1)', padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span style={{ color: 'var(--txt)', fontSize: 9.5, letterSpacing: '0.22em', fontWeight: 600 }}>SECTOR HEAT</span>
        <span style={{ color: 'var(--txt-mute)', fontSize: 9, letterSpacing: '0.14em' }}>30D · ROLLING</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: 'var(--txt-mute)', fontSize: 9 }}>top vs bot · 165 bp dispersion</span>
      </div>
      <div style={{ display: 'flex', height: 26, gap: 1 }}>
        {sectors.map(s => (
          <div key={s.name} style={{
            flex: s.w,
            background: s.chg >= 0 ? `rgba(33,201,122,${Math.min(0.9, 0.2 + Math.abs(s.chg) * 0.4)})` : `rgba(255,70,85,${Math.min(0.9, 0.2 + Math.abs(s.chg) * 0.4)})`,
            color: '#000',
            fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 8px',
          }}>
            <span>{s.name}</span>
            <span>{s.chg >= 0 ? '+' : ''}{s.chg.toFixed(2)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TRADE — large NVDA chart + DOM ladder + position sizer + scenario grid.
// Designed to be the "single-asset commit" page: every pixel is about
// pulling the trigger.
// ---------------------------------------------------------------------------
function TradeView({ accent, chartOpts, perChartInd, setPerChartInd }) {
  const [hover, setHover] = useStateP3(null);
  const d = SX.quadData[0]; // NVDA
  const last = d.series[d.series.length - 1].c;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 280px', height: '100%', background: 'var(--bg)' }}>
      <div style={{ display: 'grid', gridTemplateRows: 'minmax(0,1fr) 1px 200px', minHeight: 0, background: 'var(--surf-1)' }}>
        <ChartCanvas
          data={d} hover={hover} onHover={setHover}
          accent={accent}
          chartOpts={{ ...chartOpts, onIndicatorChange: (sym, k, v) => {
            setPerChartInd(p => ({ ...p, [sym]: { ...(p[sym]||{}), [k.replace('show','').toLowerCase()]: v } }));
          }}}
          showToolbar
          size={{ w: 1000, h: 660 }}
          indicators={perChartInd[d.sym]}
        />
        <div style={{ background: 'var(--line)' }} />
        <ScenarioGrid accent={accent} last={last} />
      </div>
      <div style={{ background: 'var(--line)' }} />
      <DomLadder accent={accent} />
    </div>
  );
}

function DomLadder({ accent }) {
  // Aggregated ladder around mid — bids on bottom, asks on top, click-to-trade column.
  const { mid, asks, bids } = SX.book;
  const rows = [
    ...[...asks].slice(0, 9).reverse().map(r => ({ ...r, side: 'ask' })),
    { mid: true, p: mid },
    ...bids.slice(0, 9).map(r => ({ ...r, side: 'bid' })),
  ];
  const maxSz = Math.max(...asks.map(r=>r.size), ...bids.map(r=>r.size));
  return (
    <div style={{ background: 'var(--surf-1)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PanelHead title="DOM · NVDA" right={<span>click PX to send · 1-tick aggression</span>} />
      <div style={{ display: 'grid', gridTemplateColumns: '60px 60px 60px 60px', padding: '4px 12px 2px', color: 'var(--txt-mute)', fontSize: 9, letterSpacing: '0.14em' }}>
        <span>BIDS</span><span style={{ textAlign: 'right' }}>SIZE</span><span style={{ textAlign: 'right' }}>PX</span><span style={{ textAlign: 'right' }}>SIZE</span>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {rows.map((r, i) => {
          if (r.mid) {
            return (
              <div key={'m'+i} style={{
                display: 'grid', gridTemplateColumns: '60px 60px 60px 60px',
                padding: '4px 12px', background: 'rgba(255,255,255,0.04)',
                borderTop: '1px solid rgba(255,255,255,0.08)', borderBottom: '1px solid rgba(255,255,255,0.08)',
                color: accent, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
              }}>
                <span style={{ color: 'var(--txt-mute)', fontSize: 9, letterSpacing: '0.12em' }}>MID</span>
                <span></span>
                <span style={{ textAlign: 'right' }}>{r.p.toFixed(2)}</span>
                <span style={{ textAlign: 'right', color: 'var(--txt-mute)', fontSize: 9 }}>VPIN 0.18</span>
              </div>
            );
          }
          const w = (r.size / (maxSz || 1)) * 60;
          const ask = r.side === 'ask';
          return (
            <div key={r.side+r.p} style={{
              display: 'grid', gridTemplateColumns: '60px 60px 60px 60px',
              alignItems: 'center', padding: '2px 12px', fontSize: 10.5, position: 'relative',
            }}>
              {/* depth bar */}
              {ask
                ? <span style={{ position: 'absolute', right: '50%', top: 1, bottom: 1, width: `${w}px`, background: 'var(--neg)', opacity: 0.10 }} />
                : <span style={{ position: 'absolute', left: '50%', top: 1, bottom: 1, width: `${w}px`, background: 'var(--pos)', opacity: 0.10 }} />}
              <span style={{ color: 'var(--txt-mute)', fontSize: 9, position: 'relative' }}>{ask ? '' : `${(r.tot/1000).toFixed(1)}k`}</span>
              <span style={{ color: 'var(--txt-dim)', textAlign: 'right', position: 'relative' }}>{!ask ? r.size.toLocaleString() : ''}</span>
              <span style={{ color: ask ? 'var(--neg)' : 'var(--pos)', textAlign: 'right', position: 'relative', cursor: 'pointer' }}>{r.p.toFixed(2)}</span>
              <span style={{ color: 'var(--txt-dim)', textAlign: 'right', position: 'relative' }}>{ask ? r.size.toLocaleString() : ''}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScenarioGrid({ accent, last }) {
  // What-if grid: shows P&L impact across stop/target combinations.
  const stops = [-0.5, -1.0, -1.5];
  const tgts  = [+0.5, +1.0, +1.5, +2.0];
  const qty = 100;
  return (
    <div style={{ background: 'var(--surf-1)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PanelHead title="SCENARIO MATRIX" right={<span>QTY 100 · NVDA · linear P&L</span>} />
      <div style={{ padding: '4px 14px 10px', display: 'grid', gridTemplateColumns: `60px repeat(${tgts.length}, 1fr)`, gap: 1, fontSize: 10.5 }}>
        <span style={{ color: 'var(--txt-mute)', fontSize: 9, letterSpacing: '0.14em' }}>STOP \ TGT</span>
        {tgts.map(t => <span key={t} style={{ color: 'var(--pos)', textAlign: 'center', fontSize: 10 }}>+{t.toFixed(1)}%</span>)}
        {stops.map(s => (
          <React.Fragment key={s}>
            <span style={{ color: 'var(--neg)', fontSize: 10 }}>{s.toFixed(1)}%</span>
            {tgts.map(t => {
              const rr = Math.abs(t / s);
              const ev = (last * qty * t / 100) * 0.6 + (last * qty * s / 100) * 0.4;
              const good = rr >= 2;
              return (
                <div key={t} style={{
                  background: good ? 'rgba(33,201,122,0.10)' : 'rgba(255,70,85,0.07)',
                  padding: '5px 6px', textAlign: 'center',
                }}>
                  <div style={{ color: good ? 'var(--pos)' : 'var(--txt-dim)', fontWeight: 600 }}>R:R {rr.toFixed(1)}</div>
                  <div style={{ color: 'var(--txt-mute)', fontSize: 9 }}>EV ${ev.toFixed(0)}</div>
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FOCUS — single-symbol deep dive: 4 stacked timeframes that scroll together.
// ---------------------------------------------------------------------------
function FocusView({ accent, chartOpts, perChartInd, setPerChartInd }) {
  const [hover, setHover] = useStateP3(null);
  const d = SX.quadData[0];
  // Generate dedicated higher-aggregation series so each timeframe looks
  // fully populated. We seed off the same root so they look like the same
  // underlying asset at different cadences.
  const tfs = useMemoP3(() => {
    const mk = (seed, vol, drift, regime, tf) => {
      const series = SX.genSeries({ seed, n: 140, start: d.series[d.series.length-1].c, vol, drift, regime });
      return {
        ...d, tf,
        series,
        ema9:  SX.ema(series, 9),
        ema21: SX.ema(series, 21),
        vwap:  SX.vwap(series),
        rsi:   SX.rsiLast(series, 14),
      };
    };
    return [
      { label: '5s',  data: d },
      { label: '1m',  data: mk(d.series.length + 909, d.series[0].c * 0.004, 0.08, 'trend', '1m') },
      { label: '15m', data: mk(d.series.length + 1213, d.series[0].c * 0.010, 0.18, 'trend', '15m') },
    ];
  }, [d.sym]);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 260px', height: '100%', background: 'var(--bg)' }}>
      <div style={{ display: 'grid', gridTemplateRows: '1fr 1px 1fr 1px 1fr', minHeight: 0, background: 'var(--surf-1)' }}>
        {tfs.map((t, i) => (
          <React.Fragment key={t.label}>
            <div style={{ overflow: 'hidden', position: 'relative' }}>
              <ChartCanvas
                data={t.data} hover={hover} onHover={setHover}
                accent={accent} chartOpts={chartOpts}
                size={{ w: 1240, h: 290 }}
                indicators={perChartInd[d.sym]}
                showToolbar
              />
            </div>
            {i < tfs.length - 1 && <div style={{ background: 'var(--line)' }} />}
          </React.Fragment>
        ))}
      </div>
      <div style={{ background: 'var(--line)' }} />
      <FlowPanel accent={accent} />
    </div>
  );
}

function every(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr[i]);
  return out;
}

function FlowPanel({ accent }) {
  // Recent prints panel (simulated tape)
  const prints = useMemoP3(() => {
    const now = Date.now();
    let p = 962.40;
    return Array.from({ length: 22 }, (_, i) => {
      p += (Math.random() - 0.5) * 0.06;
      const sz = Math.floor(80 + Math.random() * (Math.random() < 0.15 ? 4000 : 600));
      const side = Math.random() > 0.5 ? 'B' : 'A';
      const ts = new Date(now - i * 220).toISOString().slice(11, 19);
      return { ts, p: +p.toFixed(2), sz, side };
    });
  }, []);
  return (
    <div style={{ background: 'var(--surf-1)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PanelHead title="TIME · SALES · NVDA" right={<span>last 22 prints</span>} />
      <div style={{ flex: 1, overflow: 'hidden', padding: '0 12px 8px' }}>
        {prints.map((r, i) => {
          const big = r.sz >= 1000;
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 60px 1fr 16px', alignItems: 'baseline', fontSize: 10.5, padding: '2px 0' }}>
              <span style={{ color: 'var(--txt-mute)' }}>{r.ts}</span>
              <span style={{ color: r.side === 'B' ? 'var(--pos)' : 'var(--neg)', textAlign: 'right' }}>{r.p.toFixed(2)}</span>
              <span style={{ color: big ? 'var(--txt)' : 'var(--txt-dim)', textAlign: 'right', fontWeight: big ? 700 : 400 }}>
                {r.sz.toLocaleString()}{big ? '*' : ''}
              </span>
              <span style={{ color: r.side === 'B' ? 'var(--pos)' : 'var(--neg)', textAlign: 'right', fontSize: 9 }}>{r.side}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MARKETS — leaderboard cards + scannable table. Matches the screenshot:
// 4 cards (gainer / loser / volume / volatile) over a filterable list with
// inline sparklines + Buy chip per row.
// ---------------------------------------------------------------------------
function MarketsView({ accent }) {
  const [filter, setFilter] = useStateP3('');
  const [cat, setCat] = useStateP3('ALL');
  const [sort, setSort] = useStateP3('vol');

  const rows = useMemoP3(() => {
    let out = SX.markets.filter(r => cat === 'ALL' || r.cat === cat);
    if (filter) out = out.filter(r => r.sym.toLowerCase().includes(filter.toLowerCase()) || r.name.toLowerCase().includes(filter.toLowerCase()));
    out = [...out].sort((a, b) => {
      if (sort === 'sym')  return a.sym.localeCompare(b.sym);
      if (sort === 'chg')  return b.chg - a.chg;
      if (sort === 'vol')  return b.vol - a.vol;
      if (sort === 'last') return b.last - a.last;
      if (sort === 'not')  return b.notional - a.notional;
      return 0;
    });
    return out;
  }, [filter, cat, sort]);

  const topGain = [...SX.markets].sort((a, b) => b.chg - a.chg)[0];
  const topLose = [...SX.markets].sort((a, b) => a.chg - b.chg)[0];
  const topVol  = [...SX.markets].sort((a, b) => b.vol - a.vol)[0];
  const topVlt  = [...SX.markets].sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg))[0];

  return (
    <div style={{ display: 'grid', gridTemplateRows: '144px 1px 1fr', height: '100%', background: 'var(--bg)' }}>
      {/* Leaderboard cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: '12px 16px', background: 'var(--surf-1)' }}>
        <LeaderCard label="TOP GAINER"   row={topGain} positive />
        <LeaderCard label="TOP LOSER"    row={topLose} />
        <LeaderCard label="MOST VOLUME"  row={topVol}  positive={topVol.chg >= 0} />
        <LeaderCard label="MOST VOLATILE" row={topVlt} positive={topVlt.chg >= 0} />
      </div>
      <div style={{ background: 'var(--line)' }} />

      {/* Search + table */}
      <div style={{ background: 'var(--surf-1)', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--line)' }}>
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Search symbols · $NVDA · $SPY …"
            style={{
              flex: 1, background: 'var(--bg-deep)', border: '1px solid rgba(255,255,255,0.08)',
              outline: 'none', color: 'var(--txt)', fontFamily: 'inherit', fontSize: 11,
              padding: '8px 12px',
            }}
          />
          <div style={{ display: 'flex', gap: 2 }}>
            {['ALL', 'EQ', 'IDX', 'FUT', 'CRY'].map(c => (
              <button key={c} onClick={() => setCat(c)} style={{
                background: cat === c ? 'rgba(255,255,255,0.08)' : 'transparent',
                border: '1px solid ' + (cat === c ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)'),
                color: cat === c ? 'var(--txt)' : 'var(--txt-mute)',
                fontFamily: 'inherit', fontSize: 10, letterSpacing: '0.12em',
                padding: '6px 10px', cursor: 'pointer',
              }}>{c}</button>
            ))}
          </div>
          <span style={{ color: 'var(--txt-mute)', fontSize: 10, letterSpacing: '0.12em', minWidth: 50, textAlign: 'right' }}>{rows.length}/{SX.markets.length}</span>
        </div>

        {/* Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '80px 1fr 110px 90px 110px 110px 132px 70px',
          gap: 8, padding: '10px 16px', color: 'var(--txt-mute)',
          fontSize: 9.5, letterSpacing: '0.18em', borderBottom: '1px solid var(--line)',
        }}>
          <HSort label="SYMBOL" k="sym" sort={sort} setSort={setSort} />
          <HSort label="NAME"   k="name" sort={sort} setSort={setSort} />
          <HSort label="PRICE"  k="last" sort={sort} setSort={setSort} align="right" />
          <HSort label="24H"    k="chg"  sort={sort} setSort={setSort} align="right" />
          <HSort label="VOLUME" k="vol"  sort={sort} setSort={setSort} align="right" />
          <HSort label="NOTIONAL" k="not" sort={sort} setSort={setSort} align="right" />
          <span style={{ textAlign: 'center' }}>TREND · 60</span>
          <span></span>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {rows.map((r, i) => (
            <div key={r.sym + i} style={{
              display: 'grid',
              gridTemplateColumns: '80px 1fr 110px 90px 110px 110px 132px 70px',
              gap: 8, padding: '8px 16px', alignItems: 'center',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              background: i % 2 ? 'rgba(255,255,255,0.012)' : 'transparent',
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  background: 'rgba(245,196,106,0.10)', color: 'var(--ema9)',
                  padding: '2px 6px', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                }}>${r.sym}</span>
                <span style={{ color: 'var(--txt-mute)', fontSize: 9, letterSpacing: '0.1em' }}>{r.cat === 'EQ' ? 'SIM' : r.cat}</span>
              </span>
              <span style={{ color: 'var(--txt-dim)', fontSize: 11 }}>{r.name}</span>
              <span style={{ color: 'var(--txt)', fontSize: 11.5, textAlign: 'right', fontWeight: 600 }}>{r.last.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              <span style={{ color: r.chg >= 0 ? 'var(--pos)' : 'var(--neg)', fontSize: 11, textAlign: 'right' }}>
                {r.chg >= 0 ? '+' : ''}{r.chg.toFixed(2)}%
              </span>
              <span style={{ color: 'var(--txt-dim)', fontSize: 11, textAlign: 'right' }}>{formatVol(r.vol)}</span>
              <span style={{ color: 'var(--txt-dim)', fontSize: 11, textAlign: 'right' }}>{formatNotional(r.notional)}</span>
              <div style={{ height: 26 }}>
                <RowSpark pts={r.spark} chg={r.chg} />
              </div>
              <button style={{
                background: 'var(--pos)', color: '#000', fontFamily: 'inherit',
                fontWeight: 700, fontSize: 10.5, letterSpacing: '0.12em',
                padding: '5px 14px', border: 'none', cursor: 'pointer',
              }}>Buy</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HSort({ label, k, sort, setSort, align }) {
  const active = sort === k;
  return (
    <span onClick={() => setSort(k)} style={{
      textAlign: align || 'left', cursor: 'pointer',
      color: active ? 'var(--txt)' : 'var(--txt-mute)',
    }}>
      {label}{active ? ' ▾' : ''}
    </span>
  );
}

function LeaderCard({ label, row, positive }) {
  const pts = row.spark;
  const min = Math.min(...pts), max = Math.max(...pts);
  const W = 320, H = 50;
  const path = pts.map((v, i) => `${(i / (pts.length - 1)) * W},${H - ((v - min) / (max - min || 1)) * (H - 6) - 3}`).join(' ');
  const color = positive ? 'var(--pos)' : 'var(--neg)';
  return (
    <div style={{
      background: 'var(--bg-deep)', padding: '10px 14px',
      display: 'flex', flexDirection: 'column', gap: 4, position: 'relative', overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ color: 'var(--txt-mute)', fontSize: 9, letterSpacing: '0.18em' }}>{label}</span>
        <span style={{ color, fontSize: 10, fontWeight: 600 }}>{row.chg >= 0 ? '+' : ''}{row.chg.toFixed(2)}%</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ color: 'var(--ema9)', fontSize: 16, fontWeight: 700 }}>${row.sym}</span>
        <span style={{ color: 'var(--txt-mute)', fontSize: 10 }}>{row.name}</span>
      </div>
      <div style={{ color: 'var(--txt)', fontSize: 18, fontWeight: 600, marginTop: 2 }}>
        {row.last.toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </div>
      <div style={{ position: 'absolute', right: 0, bottom: 0, opacity: 0.7 }}>
        <svg width={W * 0.5} height={H * 0.7} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <polyline points={path} fill="none" stroke={color} strokeWidth="1.5" />
        </svg>
      </div>
    </div>
  );
}

function RowSpark({ pts, chg }) {
  const min = Math.min(...pts), max = Math.max(...pts);
  const W = 120, H = 24;
  const path = pts.map((v, i) => `${(i / (pts.length - 1)) * W},${H - ((v - min) / (max - min || 1)) * (H - 4) - 2}`).join(' ');
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <polyline points={path} fill="none" stroke={chg >= 0 ? 'var(--pos)' : 'var(--neg)'} strokeWidth="1" strokeOpacity="0.85" />
    </svg>
  );
}

function formatVol(v) {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K';
  return String(v);
}
function formatNotional(v) {
  if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T';
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
  return '$' + (v / 1e3).toFixed(0) + 'K';
}

// ---------------------------------------------------------------------------
// REPLAY — historical session replay with scrubber, transport, bookmarks.
// ---------------------------------------------------------------------------
function ReplayView({ accent, chartOpts, perChartInd, setPerChartInd }) {
  const [tab, setTab] = useStateP3('sessions'); // sessions | hist
  const [session, setSession] = useStateP3(SX.replaySessions[0].id);
  const [pos, setPos] = useStateP3(0.46);
  const [paused, setPaused] = useStateP3(true);
  const [speed, setSpeed] = useStateP3(1);
  const [hover, setHover] = useStateP3(null);

  // Auto-advance when playing
  useEffectP3(() => {
    if (paused) return;
    const id = setInterval(() => setPos(p => Math.min(1, p + 0.001 * speed)), 100);
    return () => clearInterval(id);
  }, [paused, speed]);

  const d = SX.quadData[0];
  const tot = '8h 30m 45s';
  const elap = formatHms(pos * 30645);
  const remn = formatHms((1 - pos) * 30645);
  const cur = '16:30:44';

  return (
    <div style={{ display: 'grid', gridTemplateRows: '38px 1px 220px 1px minmax(0,1fr) 1px 28px', height: '100%', background: 'var(--bg)' }}>
      {/* Tab strip + paused chip */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px', gap: 24, background: 'var(--surf-1)' }}>
        {[{id:'sessions',label:'My Sessions'},{id:'hist',label:'Historical Day'}].map(x => (
          <span key={x.id} onClick={() => setTab(x.id)} style={{
            color: tab === x.id ? accent : 'var(--txt-dim)',
            borderBottom: tab === x.id ? `2px solid ${accent}` : '2px solid transparent',
            padding: '10px 0', cursor: 'pointer', fontSize: 11,
          }}>{x.label}</span>
        ))}
        <span style={{ flex: 1 }} />
        <span style={{
          background: 'var(--warn)', color: '#000', fontSize: 10, letterSpacing: '0.16em',
          fontWeight: 700, padding: '3px 10px',
        }}>{paused ? 'PAUSED' : 'PLAYING'}</span>
      </div>
      <div style={{ background: 'var(--line)' }} />

      {/* Scrubber pane */}
      <div style={{ background: 'var(--surf-1)', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'var(--txt-mute)', fontSize: 9, letterSpacing: '0.22em' }}>RECORDED SESSION</span>
          <select value={session} onChange={e => setSession(e.target.value)} style={{
            flex: 1, background: 'var(--bg-deep)', border: '1px solid rgba(255,255,255,0.08)',
            color: 'var(--txt)', fontFamily: 'inherit', fontSize: 11, padding: '7px 12px', outline: 'none',
          }}>
            {SX.replaySessions.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, auto)', gap: 18, fontSize: 10 }}>
            <KVS k="CURSOR" v={cur} />
            <KVS k="ELAPSED" v={elap} />
            <KVS k="TOTAL" v={tot} />
            <KVS k="SPEED" v={`${speed}×`} />
          </div>
        </div>

        {/* Scrubber */}
        <ReplayScrubber pos={pos} setPos={setPos} bookmarks={SX.replayBookmarks} accent={accent} />

        {/* Transport */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setPaused(p => !p)} style={{
            background: paused ? 'var(--pos)' : 'var(--warn)', color: '#000', border: 'none',
            fontFamily: 'inherit', fontWeight: 700, fontSize: 11, letterSpacing: '0.14em',
            padding: '8px 18px', cursor: 'pointer', minWidth: 110,
          }}>{paused ? '▶ Resume' : '⏸ Pause'}</button>
          <button onClick={() => { setPaused(true); setPos(1); }} style={{
            background: 'transparent', color: 'var(--neg)',
            border: '1px solid var(--neg)', fontFamily: 'inherit',
            fontSize: 11, letterSpacing: '0.14em',
            padding: '7px 14px', cursor: 'pointer', fontWeight: 600,
          }}>■ Stop · Return to Live</button>
          <span style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 1 }}>
            {[0.5, 1, 2, 5, 10, 30, 100].map(s => (
              <button key={s} onClick={() => setSpeed(s)} style={{
                background: speed === s ? 'rgba(0,200,255,0.16)' : 'var(--bg-deep)',
                color: speed === s ? accent : 'var(--txt-dim)',
                border: '1px solid ' + (speed === s ? accent : 'rgba(255,255,255,0.08)'),
                fontFamily: 'inherit', fontSize: 10, letterSpacing: '0.08em',
                padding: '5px 12px', cursor: 'pointer', minWidth: 38,
              }}>{s < 1 ? '½×' : `${s}×`}</button>
            ))}
          </div>
        </div>

        {/* Bookmark input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input placeholder="Bookmark label · press B" style={{
            flex: 1, background: 'var(--bg-deep)', border: '1px solid rgba(255,255,255,0.08)',
            color: 'var(--txt)', fontFamily: 'inherit', fontSize: 11, padding: '6px 12px', outline: 'none',
          }}/>
          <button style={{
            background: 'transparent', color: 'var(--txt-dim)', border: '1px solid rgba(255,255,255,0.12)',
            fontFamily: 'inherit', fontSize: 10, letterSpacing: '0.14em',
            padding: '6px 14px', cursor: 'pointer',
          }}>+ Bookmark</button>
        </div>
      </div>
      <div style={{ background: 'var(--line)' }} />

      {/* Chart with replay overlay */}
      <div style={{ position: 'relative', background: 'var(--surf-1)', minHeight: 0 }}>
        <ChartCanvas
          data={d} hover={hover} onHover={setHover}
          accent={accent}
          chartOpts={{ ...chartOpts, onIndicatorChange: (sym, k, v) => {
            setPerChartInd(p => ({ ...p, [sym]: { ...(p[sym]||{}), [k.replace('show','').toLowerCase()]: v } }));
          }}}
          showToolbar
          size={{ w: 1240, h: 480 }}
          indicators={perChartInd[d.sym]}
        />
        <div style={{
          position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(20,20,26,0.95)', padding: '4px 14px',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', gap: 14, fontSize: 10, letterSpacing: '0.14em',
        }}>
          <span style={{ color: 'var(--warn)' }}>● HISTORICAL REPLAY</span>
          <span style={{ color: 'var(--txt)' }}>{SX.replaySessions.find(s=>s.id===session)?.label.split(' · ')[0] || '2026-05-19'}</span>
          <span style={{ color: 'var(--txt-mute)' }}>{cur}</span>
        </div>
      </div>
      <div style={{ background: 'var(--line)' }} />

      {/* Status footer */}
      <div style={{ background: 'var(--surf-1)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 16, fontSize: 10 }}>
        <span style={{ color: 'var(--accent)' }}>● Replaying historical day {session.replace('hist_','hist_').replace(/-/g,'-')}_  · 0 ticks emitted</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: 'var(--txt-mute)' }}>SPACE play/pause · ← → seek 5s · [ ] speed · B bookmark</span>
      </div>
    </div>
  );
}

function ReplayScrubber({ pos, setPos, bookmarks, accent }) {
  const onClick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPos(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
  };
  return (
    <div onClick={onClick} style={{
      height: 18, position: 'relative', cursor: 'pointer',
      background: 'rgba(255,255,255,0.04)',
    }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pos * 100}%`, background: accent, opacity: 0.5 }} />
      {/* bookmarks */}
      {bookmarks.map((b, i) => (
        <div key={i} title={b.label} style={{
          position: 'absolute', left: `${b.t * 100}%`, top: -4, bottom: -4, width: 2, marginLeft: -1,
          background: b.color === 'pos' ? 'var(--pos)' : b.color === 'neg' ? 'var(--neg)' : b.color === 'warn' ? 'var(--warn)' : accent,
        }} />
      ))}
      {/* handle */}
      <div style={{
        position: 'absolute', left: `${pos * 100}%`, top: -4, bottom: -4, width: 12, marginLeft: -6,
        background: accent, boxShadow: '0 0 0 2px rgba(0,0,0,0.5)',
      }} />
    </div>
  );
}

function KVS({ k, v }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column' }}>
      <span style={{ color: 'var(--txt-mute)', fontSize: 8.5, letterSpacing: '0.18em' }}>{k}</span>
      <span style={{ color: 'var(--txt)', fontSize: 12, fontWeight: 600, marginTop: 1, letterSpacing: '0.04em' }}>{v}</span>
    </span>
  );
}

function formatHms(secs) {
  secs = Math.floor(secs);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
}

// ---------------------------------------------------------------------------
// QUAD — 4 saved stocks, per-chart indicator toggles, per-chart zoom/pan,
// drop-target swap to rearrange, "save layout" persistence.
// ---------------------------------------------------------------------------
function QuadView({ accent, chartOpts, perChartInd, setPerChartInd }) {
  // Quad slots — user can swap stocks via the slot selector dropdown.
  const allSyms = useMemoP3(() => SX.markets.map(r => ({ sym: r.sym, name: r.name, cat: r.cat })), []);
  const [slots, setSlots] = useStateP3(() => SX.quadData.map(d => d.sym));
  const [syncTime, setSyncTime] = useStateP3(false);

  const dataForSym = (sym) => {
    let d = SX.quadData.find(x => x.sym === sym);
    if (d) return d;
    // build on the fly from markets
    const r = SX.markets.find(x => x.sym === sym);
    if (!r) return SX.quadData[0];
    const ser = SX.genSeries({ seed: r.seed + 401, n: 140, start: r.last, vol: Math.max(0.15, Math.abs(r.last)*0.0015), drift: r.chg/200, regime: 'trend' });
    return {
      sym: r.sym, name: r.name, tf: '5s', exchange: r.cat === 'CRY' ? 'CBSE' : r.cat === 'FUT' ? 'CME' : 'NSDQ',
      series: ser, ema9: SX.ema(ser, 9), ema21: SX.ema(ser, 21), vwap: SX.vwap(ser), rsi: SX.rsiLast(ser),
    };
  };

  const [expandedIdx, setExpandedIdx] = useStateP3(null);
  const [hover, setHover] = useStateP3(null);

  return (
    <div style={{ display: 'grid', gridTemplateRows: '34px 1px minmax(0,1fr)', height: '100%', background: 'var(--bg)' }}>
      {/* Quad action bar */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 14px', gap: 14, background: 'var(--surf-1)' }}>
        <span style={{ color: 'var(--txt)', fontSize: 10, letterSpacing: '0.22em', fontWeight: 600 }}>QUAD · 2×2</span>
        <span style={{ color: 'var(--txt-mute)', fontSize: 9.5, letterSpacing: '0.14em' }}>SAVED SLOTS · LAST SESSION</span>
        <span style={{ flex: 1 }} />
        <ToggleChip label="SYNC TIMEBASE" value={syncTime} onChange={setSyncTime} accent={accent} />
        <ToggleChip label="LINK CROSSHAIR" value={true} accent={accent} />
        <button style={btnLinkLite}>↻ RESET ZOOM</button>
        <button style={btnLinkLite}>⬚ SAVE LAYOUT</button>
      </div>
      <div style={{ background: 'var(--line)' }} />

      {expandedIdx != null ? (
        <QuadFocus
          idx={expandedIdx}
          data={dataForSym(slots[expandedIdx])}
          allSyms={allSyms}
          slots={slots}
          setSlots={setSlots}
          accent={accent}
          chartOpts={chartOpts}
          perChartInd={perChartInd}
          setPerChartInd={setPerChartInd}
          onRestore={() => setExpandedIdx(null)}
          hover={hover} setHover={setHover}
        />
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1fr) 1px minmax(0,1fr)',
          gridTemplateRows: 'minmax(0,1fr) 1px minmax(0,1fr)',
          minHeight: 0, background: 'var(--bg)',
        }}>
          {slots.map((sym, i) => (
            <React.Fragment key={i}>
              {i === 1 && <div style={{ background: 'var(--line)' }} />}
              {i === 2 && <div style={{ gridColumn: '1 / 4', background: 'var(--line)' }} />}
              {i === 3 && <div style={{ background: 'var(--line)' }} />}
              <QuadCell
                idx={i}
                data={dataForSym(sym)}
                allSyms={allSyms}
                onChangeSym={(s) => setSlots(prev => prev.map((x, j) => j === i ? s : x))}
                onExpand={() => setExpandedIdx(i)}
                accent={accent}
                chartOpts={chartOpts}
                perChartInd={perChartInd}
                setPerChartInd={setPerChartInd}
                hover={syncTime ? hover : null}
                setHover={syncTime ? setHover : undefined}
              />
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

function QuadCell({ idx, data, allSyms, onChangeSym, onExpand, accent, chartOpts, perChartInd, setPerChartInd, hover, setHover }) {
  const [localHover, setLocalHover] = useStateP3(null);
  const [open, setOpen] = useStateP3(false);
  const h = hover != null ? hover : localHover;
  const onH = setHover || setLocalHover;

  return (
    <div style={{ background: 'var(--surf-1)', position: 'relative', overflow: 'hidden', minHeight: 0 }}>
      {/* Slot bar — symbol selector + indicator toggles + expand */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '6px 10px', gap: 10,
        background: 'rgba(0,0,0,0.25)', borderBottom: '1px solid var(--line)',
        position: 'relative', zIndex: 3,
      }}>
        <button onClick={() => setOpen(o => !o)} style={{
          background: 'transparent', color: 'var(--txt)', border: '1px solid rgba(255,255,255,0.1)',
          padding: '3px 10px 3px 8px', fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
          letterSpacing: '0.06em', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ color: 'var(--ema9)' }}>${data.sym}</span>
          <span style={{ color: 'var(--txt-mute)', fontSize: 9 }}>▾</span>
        </button>
        <span style={{ color: 'var(--txt-mute)', fontSize: 10 }}>{data.name}</span>
        <span style={{ flex: 1 }} />
        <ChartChipsRow data={data} perChartInd={perChartInd} setPerChartInd={setPerChartInd} accent={accent} />
        <button onClick={onExpand} title="focus" style={{
          background: 'transparent', color: 'var(--txt-mute)', border: '1px solid rgba(255,255,255,0.1)',
          padding: '2px 7px', fontFamily: 'inherit', fontSize: 11, cursor: 'pointer',
        }}>⤢</button>
      </div>

      {/* Symbol picker dropdown */}
      {open && (
        <SymbolPicker
          allSyms={allSyms}
          onPick={(s) => { onChangeSym(s); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}

      <div style={{ position: 'absolute', left: 0, right: 0, top: 34, bottom: 0 }}>
        <ChartCanvas
          data={data}
          hover={h} onHover={onH}
          accent={accent}
          chartOpts={chartOpts}
          showHeader={false}
          size={{ w: 720, h: 320 }}
          indicators={perChartInd[data.sym]}
        />
      </div>
    </div>
  );
}

function ChartChipsRow({ data, perChartInd, setPerChartInd, accent }) {
  const ind = {
    ema9:  true,  ema21: true,  vwap: true, rsi: true,
    ...(perChartInd[data.sym] || {}),
  };
  const toggle = (k) => setPerChartInd(p => ({ ...p, [data.sym]: { ...(p[data.sym]||{}), [k]: !ind[k] } }));
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      <SmallChip active={ind.ema9}  onClick={() => toggle('ema9')}  swatch="var(--ema9)">EMA9</SmallChip>
      <SmallChip active={ind.ema21} onClick={() => toggle('ema21')} swatch="var(--ema21)">EMA21</SmallChip>
      <SmallChip active={ind.vwap}  onClick={() => toggle('vwap')}  swatch={accent}>VWAP</SmallChip>
    </div>
  );
}

function SmallChip({ active, onClick, swatch, children }) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
      border: '1px solid ' + (active ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)'),
      color: active ? 'var(--txt)' : 'var(--txt-mute)',
      fontFamily: 'inherit', fontSize: 9, letterSpacing: '0.08em',
      padding: '3px 7px', cursor: 'pointer',
    }}>
      <span style={{ width: 5, height: 5, background: swatch, opacity: active ? 1 : 0.35 }} />
      {children}
    </button>
  );
}

function SymbolPicker({ allSyms, onPick, onClose }) {
  const [q, setQ] = useStateP3('');
  const rows = allSyms.filter(s => !q || s.sym.toLowerCase().includes(q.toLowerCase()) || s.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 4 }} />
      <div style={{
        position: 'absolute', left: 10, top: 36, width: 240,
        background: 'var(--bg)', border: '1px solid rgba(255,255,255,0.14)',
        zIndex: 5, padding: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
      }}>
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="filter…" style={{
          width: '100%', background: 'var(--bg-deep)', border: '1px solid rgba(255,255,255,0.08)',
          color: 'var(--txt)', fontFamily: 'inherit', fontSize: 11, padding: '5px 8px', outline: 'none', marginBottom: 6,
        }}/>
        <div style={{ maxHeight: 280, overflowY: 'auto' }}>
          {rows.map(r => (
            <div key={r.sym + r.name} onClick={() => onPick(r.sym)} style={{
              display: 'flex', alignItems: 'baseline', gap: 8,
              padding: '4px 8px', cursor: 'pointer', fontSize: 11,
            }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ color: 'var(--ema9)', fontWeight: 700, minWidth: 50 }}>{r.sym}</span>
              <span style={{ color: 'var(--txt-mute)', fontSize: 9 }}>{r.cat}</span>
              <span style={{ color: 'var(--txt-dim)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function QuadFocus({ idx, data, accent, chartOpts, perChartInd, setPerChartInd, onRestore, hover, setHover, allSyms, slots, setSlots }) {
  const [open, setOpen] = useStateP3(false);
  return (
    <div style={{ background: 'var(--surf-1)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 14, height: 34, borderBottom: '1px solid var(--line)', position: 'relative' }}>
        <span style={{ color: 'var(--accent)', fontSize: 10, letterSpacing: '0.16em' }}>● FOCUS · SLOT {idx + 1}</span>
        <button onClick={() => setOpen(o => !o)} style={{
          background: 'transparent', color: 'var(--txt)', border: '1px solid rgba(255,255,255,0.1)',
          padding: '3px 10px', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', cursor: 'pointer',
        }}>${data.sym} ▾</button>
        <span style={{ color: 'var(--txt-mute)', fontSize: 10 }}>{data.name}</span>
        <span style={{ flex: 1 }} />
        <ChartChipsRow data={data} perChartInd={perChartInd} setPerChartInd={setPerChartInd} accent={accent} />
        <button onClick={onRestore} style={btnLinkLite}>↤ RESTORE QUAD</button>
        {open && <SymbolPicker allSyms={allSyms} onPick={(s) => { setSlots(prev => prev.map((x, j) => j === idx ? s : x)); setOpen(false); }} onClose={() => setOpen(false)} />}
      </div>
      <div style={{ flex: 1, padding: '4px 8px 8px', minHeight: 0 }}>
        <ChartCanvas
          data={data} hover={hover} onHover={setHover}
          accent={accent} chartOpts={chartOpts}
          showToolbar size={{ w: 1400, h: 720 }}
          indicators={perChartInd[data.sym]}
        />
      </div>
    </div>
  );
}

function ToggleChip({ label, value, onChange, accent }) {
  return (
    <button onClick={() => onChange && onChange(!value)} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: value ? 'rgba(0,200,255,0.10)' : 'transparent',
      border: '1px solid ' + (value ? accent : 'rgba(255,255,255,0.08)'),
      color: value ? accent : 'var(--txt-mute)',
      fontFamily: 'inherit', fontSize: 9.5, letterSpacing: '0.14em',
      padding: '3px 10px', cursor: onChange ? 'pointer' : 'default',
    }}>
      <span style={{ width: 6, height: 6, background: value ? accent : 'var(--txt-mute)', borderRadius: '50%' }} />
      {label}
    </button>
  );
}

const btnLinkLite = {
  background: 'transparent', color: 'var(--txt-dim)',
  border: '1px solid rgba(255,255,255,0.1)', fontFamily: 'inherit', fontSize: 9.5,
  letterSpacing: '0.14em', padding: '3px 10px', cursor: 'pointer',
};

Object.assign(window, {
  WorkspaceView, TradeView, FocusView, MarketsView, ReplayView, QuadView,
});
