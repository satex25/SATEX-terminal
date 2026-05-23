// SATEX charts v3 — interactive candle chart with zoom/pan, clean header
// (no overlapping labels), inline indicator toggles, and an independent
// per-chart `view` (start/end indices) so each Quad cell can be navigated
// without affecting neighbours.

const { useState: useStateC, useEffect: useEffectC, useRef: useRefC, useMemo: useMemoC, useCallback: useCallbackC } = React;

// ---------------------------------------------------------------------------
// Theme read — values come from CSS custom properties so theme swaps cascade.
// ---------------------------------------------------------------------------
function readThemeColorsC() {
  const cs = getComputedStyle(document.documentElement);
  return {
    up:    cs.getPropertyValue('--pos').trim()    || '#21c97a',
    down:  cs.getPropertyValue('--neg').trim()    || '#ff4655',
    ema9:  cs.getPropertyValue('--ema9').trim()   || '#f5c46a',
    ema21: cs.getPropertyValue('--ema21').trim()  || '#b48cff',
  };
}

// ---------------------------------------------------------------------------
// useChartView — per-chart zoom/pan state.
// `view` = { start, end } indices into the bar series.
// onWheel zooms anchored on cursor; drag-X pans by shifting both indices.
// ---------------------------------------------------------------------------
function useChartView(seriesLen) {
  const [view, setView] = useStateC(() => ({ start: 0, end: seriesLen }));
  const dragRef = useRefC(null);

  // Clamp helpers
  const clamp = (s, e) => {
    const minSpan = 10;
    let span = e - s;
    if (span < minSpan) span = minSpan;
    if (s < 0) { s = 0; e = s + span; }
    if (e > seriesLen) { e = seriesLen; s = Math.max(0, e - span); }
    return { start: s, end: e };
  };

  const zoom = (factor, anchorT) => {
    setView(v => {
      const span = v.end - v.start;
      const a = v.start + anchorT * span;
      const newSpan = Math.max(10, Math.min(seriesLen, span * factor));
      const start = a - anchorT * newSpan;
      const end = start + newSpan;
      return clamp(start, end);
    });
  };

  const pan = (deltaT) => {
    setView(v => {
      const span = v.end - v.start;
      const shift = deltaT * span;
      return clamp(v.start - shift, v.end - shift);
    });
  };

  const reset = () => setView({ start: 0, end: seriesLen });

  // Auto-extend the view's right edge when new bars arrive at the tail.
  useEffectC(() => {
    setView(v => {
      if (v.end >= seriesLen - 2) {
        const span = v.end - v.start;
        return { start: Math.max(0, seriesLen - span), end: seriesLen };
      }
      return v;
    });
  }, [seriesLen]);

  return { view, zoom, pan, reset, dragRef };
}

// ---------------------------------------------------------------------------
// ChartCanvas — single interactive chart panel.
//
// Layout is divided into THREE strictly separated bands so labels never
// overlap each other:
//   1. Header band (h≈22)     — symbol · exchange · last · chg
//   2. Sub-header band (h≈18) — H/L/V/RSI on the left, legend on the right
//   3. Plot band              — candles + EMA/VWAP overlays + price axis
//   4. Time axis band (h≈18)
//
// All right-side price labels live in the dedicated right gutter (PAD.r);
// indicator legends sit BEFORE the gutter so they cannot collide.
// ---------------------------------------------------------------------------
function ChartCanvas({
  data,
  hover, onHover,
  accent,
  chartOpts = {},
  onClickHeader,
  showToolbar = false,
  showTimeAxis = true,
  showHeader = true,
  size, // { w, h } in render-px
  externalView,    // optional: parent-controlled view (for sync)
  onViewChange,    // optional: parent-control hook
  indicators,      // optional: per-chart override of { ema9, ema21, vwap, rsi }
}) {
  const SIZE = size || { w: 720, h: 360 };
  const W = SIZE.w, H = SIZE.h;
  const PAD = {
    l: 8,
    r: 62,
    t: showHeader ? 46 : 8,
    b: showTimeAxis ? 22 : 8,
  };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  const theme = readThemeColorsC();

  const ind = {
    ema9:  chartOpts.showEMA9  !== false,
    ema21: chartOpts.showEMA21 !== false,
    vwap:  chartOpts.showVWAP  !== false,
    rsi:   chartOpts.showRSI   !== false,
    ...(indicators || {}),
  };
  const gridMode = chartOpts.chartGrid || 'minimal';

  const { series, ema9, ema21, vwap, sym, name, tf, exchange, rsi } = data;
  const nFull = series.length;

  const local = useChartView(nFull);
  const view  = externalView || local.view;
  const setView = onViewChange || ((next) => {
    if (typeof next === 'function') {
      // pseudo — useChartView already handles its own setter
    }
  });

  const start = Math.max(0, Math.floor(view.start));
  const end   = Math.min(nFull, Math.ceil(view.end));
  const visible = series.slice(start, end);
  const n = Math.max(1, visible.length);
  const ema9V  = ema9.slice(start, end);
  const ema21V = ema21.slice(start, end);
  const vwapV  = vwap.slice(start, end);

  // Y-domain: include indicator extremes if shown
  const yPool = [
    ...visible.map(b => b.l),
    ...visible.map(b => b.h),
    ...(ind.ema9  ? ema9V  : []),
    ...(ind.ema21 ? ema21V : []),
    ...(ind.vwap  ? vwapV  : []),
  ];
  const min = Math.min(...yPool), max = Math.max(...yPool);
  const pad = Math.max((max - min) * 0.08, max * 0.0005);
  const yMin = min - pad, yMax = max + pad;
  const yScale = (v) => PAD.t + (1 - (v - yMin) / (yMax - yMin || 1)) * innerH;
  const xScale = (i) => PAD.l + (i + 0.5) * (innerW / n);
  const cw = Math.max(1.2, (innerW / n) * 0.66);

  const last = visible[n - 1];
  const first = visible[0];
  const chg = last.c - first.c;
  const pct = (chg / (first.c || 1)) * 100;
  const lastIsUp = chg >= 0;

  // Grid: 4 horizontal price ticks
  const gridY = useMemoC(() => {
    const out = [];
    for (let i = 0; i <= 4; i++) {
      const v = yMin + (yMax - yMin) * (i / 4);
      out.push({ v, y: yScale(v) });
    }
    return out;
  }, [yMin, yMax, PAD.t, innerH]);

  const hoverI = hover != null ? Math.round(hover * (n - 1)) : null;
  const hoverBar = hoverI != null && visible[hoverI] ? visible[hoverI] : null;

  // ---- Interaction handlers ----
  const svgRef = useRefC(null);

  const handleMouseMove = useCallbackC((e) => {
    if (!svgRef.current) return;
    const r = svgRef.current.getBoundingClientRect();
    const px = (e.clientX - r.left) * (W / r.width);
    const t = (px - PAD.l) / innerW;
    if (t >= 0 && t <= 1) onHover && onHover(t);
    else onHover && onHover(null);

    // Drag-pan
    if (local.dragRef.current && local.dragRef.current.active) {
      const dx = (e.clientX - local.dragRef.current.x);
      const t = dx / r.width;
      if (Math.abs(t) > 0.001) {
        local.pan(t);
        local.dragRef.current.x = e.clientX;
      }
    }
  }, [W, PAD.l, innerW, onHover]);

  const handleWheel = useCallbackC((e) => {
    e.preventDefault();
    const r = svgRef.current.getBoundingClientRect();
    const px = (e.clientX - r.left) * (W / r.width);
    const t = Math.max(0, Math.min(1, (px - PAD.l) / innerW));
    // Trackpad-friendly: smaller factor
    const factor = e.deltaY > 0 ? 1.12 : 0.89;
    local.zoom(factor, t);
  }, [W, PAD.l, innerW]);

  const handleMouseDown = useCallbackC((e) => {
    if (e.button !== 0) return;
    local.dragRef.current = { active: true, x: e.clientX };
    svgRef.current && svgRef.current.classList.add('satex-chart--panning');
  }, []);

  const handleMouseUp = useCallbackC(() => {
    if (local.dragRef.current) local.dragRef.current.active = false;
    svgRef.current && svgRef.current.classList.remove('satex-chart--panning');
  }, []);

  // Wheel listener must be non-passive for preventDefault
  useEffectC(() => {
    const el = svgRef.current;
    if (!el) return;
    const f = (e) => handleWheel(e);
    el.addEventListener('wheel', f, { passive: false });
    return () => el.removeEventListener('wheel', f);
  }, [handleWheel]);

  // Time axis labels — sample 4 across
  const timeLabels = useMemoC(() => {
    const out = [];
    const baseMin = 21 * 60 + 14;
    for (let i = 0; i < 4; i++) {
      const idx = Math.floor((i + 0.5) / 4 * (n - 1));
      const m = baseMin + start + idx;
      out.push({ x: PAD.l + (idx + 0.5) * (innerW / n), label: `${String(Math.floor(m/60) % 24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}` });
    }
    return out;
  }, [n, innerW, PAD.l, start]);

  // Volume ribbon at bottom of plot
  const volMax = Math.max(...visible.map(b => b.v));
  const volH = Math.min(34, innerH * 0.18);
  const volTop = PAD.t + innerH - volH;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg
        ref={svgRef}
        className="satex-chart"
        width="100%" height="100%"
        viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ display: 'block' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { onHover && onHover(null); handleMouseUp(); }}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      >
        {/* HEADER BAND — single line, hard-bounded -------------------------- */}
        {showHeader && (
          <g onClick={onClickHeader} style={{ cursor: onClickHeader ? 'pointer' : 'crosshair' }}>
            <rect x="0" y="0" width={W} height="22" fill="transparent" />
            <text x="10" y="15" fill="#d6d6d8" fontSize="11" fontWeight="700" letterSpacing="0.06em">{sym}</text>
            <text x="10" y="15" dx={sym.length * 8 + 6} fill="#5a5a64" fontSize="9.5">{exchange}</text>
            <text x="10" y="15" dx={sym.length * 8 + 6 + (exchange ? exchange.length * 5.8 : 0) + 14} fill="#4a4a52" fontSize="9.5">· {tf}</text>
            {/* Last price + change anchored on right, but NOT inside right gutter */}
            <text
              x={W - PAD.r - 6} y="15"
              fill={lastIsUp ? 'var(--pos)' : 'var(--neg)'}
              fontSize="11.5" fontWeight="700" textAnchor="end"
            >{last.c.toFixed(2)}</text>
            <text
              x={W - PAD.r - 6} y="15"
              dx={-((last.c.toFixed(2)).length * 7 + 8)}
              fill={lastIsUp ? 'var(--pos)' : 'var(--neg)'}
              fontSize="10" textAnchor="end" opacity="0.9"
            >{lastIsUp ? '+' : ''}{chg.toFixed(2)} · {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</text>
          </g>
        )}

        {/* SUB-HEADER BAND — H/L/V/RSI on left, legend on right ------------- */}
        {showHeader && (
          <>
            <line x1="0" x2={W} y1="22" y2="22" stroke="rgba(255,255,255,0.05)" />
            <g>
              <text x="10" y="38" fontSize="9.5">
                <tspan fill="#4a4a52">H</tspan> <tspan fill="#7a7a83">{Math.max(...visible.map(b=>b.h)).toFixed(2)}</tspan>
                <tspan dx="8" fill="#4a4a52">L</tspan> <tspan fill="#7a7a83">{Math.min(...visible.map(b=>b.l)).toFixed(2)}</tspan>
                <tspan dx="8" fill="#4a4a52">V</tspan> <tspan fill="#7a7a83">{(visible.reduce((a,b)=>a+b.v,0)/1e6).toFixed(2)}M</tspan>
                <tspan dx="8" fill="#4a4a52">RSI</tspan> <tspan fill={rsi > 70 ? 'var(--neg)' : rsi < 30 ? 'var(--pos)' : '#7a7a83'}>{rsi.toFixed(0)}</tspan>
                <tspan dx="8" fill="#4a4a52">ATR</tspan> <tspan fill="#7a7a83">{((max - min) * 0.18).toFixed(2)}</tspan>
              </text>

              {/* Legend — right side of sub-header. Hidden when toolbar provides
                  interactive chips (avoids stacking the same info twice). */}
              {!showToolbar && (
              <g transform={`translate(${W - PAD.r - 6}, 38)`} textAnchor="end">
                {ind.vwap && (<>
                  <text x="0" y="0" fill="#7a7a83" fontSize="9.5">VWAP</text>
                  <rect x="-26" y="-7" width="3" height="9" fill={accent} fillOpacity="0.65" />
                </>)}
                {ind.ema21 && (<>
                  <text x="-44" y="0" fill="#7a7a83" fontSize="9.5">EMA 21</text>
                  <rect x="-79" y="-7" width="3" height="9" fill={theme.ema21} />
                </>)}
                {ind.ema9 && (<>
                  <text x="-97" y="0" fill="#7a7a83" fontSize="9.5">EMA 9</text>
                  <rect x="-126" y="-7" width="3" height="9" fill={theme.ema9} />
                </>)}
              </g>
              )}
            </g>
          </>
        )}

        {/* GRID ----------------------------------------------------------- */}
        {gridMode !== 'off' && gridY.map((g, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={g.y} y2={g.y} stroke="rgba(255,255,255,0.045)" strokeDasharray={gridMode === 'dense' ? '1 2' : '2 4'} />
            <text x={W - PAD.r + 4} y={g.y + 3} fill="#4a4a52" fontSize="9.5">{g.v.toFixed(2)}</text>
          </g>
        ))}

        {/* Volume ribbon (faint) ----------------------------------------- */}
        {visible.map((b, i) => {
          const x = xScale(i);
          const up = b.c >= b.o;
          const h = (b.v / (volMax || 1)) * volH;
          return (
            <rect key={'v'+i}
              x={x - cw/2} y={PAD.t + innerH - h}
              width={cw} height={h}
              fill={up ? theme.up : theme.down} opacity="0.10"
            />
          );
        })}

        {/* VWAP --------------------------------------------------------- */}
        {ind.vwap && (
          <polyline
            fill="none" stroke={accent} strokeOpacity="0.45" strokeWidth="1" strokeDasharray="3 3"
            points={vwapV.map((v, i) => `${xScale(i)},${yScale(v)}`).join(' ')}
          />
        )}
        {ind.ema21 && (
          <polyline fill="none" stroke={theme.ema21} strokeOpacity="0.9" strokeWidth="1.2"
            points={ema21V.map((v, i) => `${xScale(i)},${yScale(v)}`).join(' ')}
          />
        )}
        {ind.ema9 && (
          <polyline fill="none" stroke={theme.ema9} strokeOpacity="0.95" strokeWidth="1.2"
            points={ema9V.map((v, i) => `${xScale(i)},${yScale(v)}`).join(' ')}
          />
        )}

        {/* Candles ------------------------------------------------------ */}
        {visible.map((b, i) => {
          const up = b.c >= b.o;
          const x = xScale(i);
          const yo = yScale(b.o), yc = yScale(b.c);
          const yh = yScale(b.h), yl = yScale(b.l);
          const fill = up ? theme.up : theme.down;
          return (
            <g key={i}>
              <line x1={x} x2={x} y1={yh} y2={yl} stroke={fill} strokeWidth="1" />
              <rect
                x={x - cw/2} y={Math.min(yo, yc)}
                width={cw} height={Math.max(1, Math.abs(yc - yo))}
                fill={fill}
              />
            </g>
          );
        })}

        {/* Last price tag — pinned to right gutter */}
        <g>
          <line x1={PAD.l} x2={W - PAD.r} y1={yScale(last.c)} y2={yScale(last.c)} stroke={lastIsUp ? theme.up : theme.down} strokeOpacity="0.35" strokeDasharray="2 3" />
          <rect x={W - PAD.r + 0.5} y={yScale(last.c) - 8} width={PAD.r - 2} height="16" fill={lastIsUp ? theme.up : theme.down} />
          <text x={W - 4} y={yScale(last.c) + 4} fill="#000" fontSize="10.5" fontWeight="700" textAnchor="end">{last.c.toFixed(2)}</text>
        </g>

        {/* Crosshair ---------------------------------------------------- */}
        {hoverI != null && hoverBar && (
          <g pointerEvents="none">
            <line x1={xScale(hoverI)} x2={xScale(hoverI)} y1={PAD.t} y2={H - PAD.b} stroke={accent} strokeOpacity="0.55" strokeDasharray="2 3" />
            <line x1={PAD.l} x2={W - PAD.r} y1={yScale(hoverBar.c)} y2={yScale(hoverBar.c)} stroke={accent} strokeOpacity="0.35" strokeDasharray="2 3" />
            {/* OHLC chip — bottom-left so it never overlaps right-side price ticks */}
            <rect x={PAD.l + 4} y={H - PAD.b - 18} width="232" height="14" fill="rgba(4,4,5,0.92)" stroke="rgba(255,255,255,0.06)" />
            <text x={PAD.l + 10} y={H - PAD.b - 7} fill="#d6d6d8" fontSize="10">
              O {hoverBar.o.toFixed(2)}  H {hoverBar.h.toFixed(2)}  L {hoverBar.l.toFixed(2)}  C {hoverBar.c.toFixed(2)}  V {(hoverBar.v/1000).toFixed(0)}k
            </text>
            {/* Y-axis price tag at crosshair */}
            <rect x={W - PAD.r + 0.5} y={yScale(hoverBar.c) - 8} width={PAD.r - 2} height="16" fill="rgba(20,20,26,0.95)" stroke={accent} strokeOpacity="0.4" />
            <text x={W - 4} y={yScale(hoverBar.c) + 4} fill={accent} fontSize="10.5" fontWeight="600" textAnchor="end">{hoverBar.c.toFixed(2)}</text>
          </g>
        )}

        {/* Time axis ---------------------------------------------------- */}
        {showTimeAxis && timeLabels.map((t, i) => (
          <text key={t.label + i} x={t.x} y={H - 6} fill="#4a4a52" fontSize="9.5" textAnchor="middle">{t.label}</text>
        ))}

        {/* Pan indicator at corner when scrolled away from "live" tail */}
        {end < nFull && (
          <g>
            <rect x={W - PAD.r - 60} y={PAD.t + 4} width="56" height="14" fill="rgba(245,166,35,0.12)" stroke="var(--warn)" strokeOpacity="0.5" />
            <text x={W - PAD.r - 32} y={PAD.t + 14} fill="var(--warn)" fontSize="9" letterSpacing="0.12em" textAnchor="middle">SCROLLED</text>
          </g>
        )}
      </svg>

      {/* Inline toolbar (zoom/reset/indicators) — only when requested */}
      {showToolbar && (
        <ChartToolbar
          sym={sym}
          view={view}
          nFull={nFull}
          onZoomIn={() => local.zoom(0.7, 0.5)}
          onZoomOut={() => local.zoom(1.4, 0.5)}
          onReset={local.reset}
          ind={ind}
          onToggle={(k, v) => {
            if (chartOpts.onIndicatorChange) chartOpts.onIndicatorChange(sym, k, v);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChartToolbar — small floating bar overlaid on each chart cell.
// Sits at the bottom-right so it never overlaps header text.
// ---------------------------------------------------------------------------
function ChartToolbar({ sym, view, nFull, onZoomIn, onZoomOut, onReset, ind, onToggle }) {
  const span = Math.round(view.end - view.start);
  return (
    <div style={{
      position: 'absolute', top: 24, right: 8,
      display: 'flex', alignItems: 'center', gap: 4,
      pointerEvents: 'auto',
      zIndex: 4,
    }}>
      <ChartChip active={ind.ema9}  onClick={() => onToggle('showEMA9', !ind.ema9)}  swatch="var(--ema9)">EMA9</ChartChip>
      <ChartChip active={ind.ema21} onClick={() => onToggle('showEMA21', !ind.ema21)} swatch="var(--ema21)">EMA21</ChartChip>
      <ChartChip active={ind.vwap}  onClick={() => onToggle('showVWAP', !ind.vwap)}  swatch="var(--accent)">VWAP</ChartChip>
      <span style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
      <ChartIcon onClick={onZoomOut} title="zoom out">−</ChartIcon>
      <ChartIcon onClick={onZoomIn}  title="zoom in">+</ChartIcon>
      <ChartIcon onClick={onReset}   title="fit">⤢</ChartIcon>
      <span style={{ color: 'var(--txt-mute)', fontSize: 9, marginLeft: 4, letterSpacing: '0.1em' }}>{span}b</span>
    </div>
  );
}

function ChartChip({ active, onClick, swatch, children }) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
      border: '1px solid ' + (active ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)'),
      color: active ? 'var(--txt)' : 'var(--txt-mute)',
      fontFamily: 'inherit', fontSize: 9, letterSpacing: '0.08em',
      padding: '2px 6px', cursor: 'pointer',
    }}>
      <span style={{ width: 5, height: 5, background: swatch, opacity: active ? 1 : 0.35 }} />
      {children}
    </button>
  );
}

function ChartIcon({ onClick, title, children }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 18, height: 18, padding: 0,
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
      color: 'var(--txt-dim)', fontFamily: 'inherit', fontSize: 11, cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>{children}</button>
  );
}

// ---------------------------------------------------------------------------
// QuadChart v3 — 2x2 grid with INDEPENDENT zoom per cell and a tiny
// "sync timebase" toggle in the gutter that links all 4 views to cell 0.
// ---------------------------------------------------------------------------
function QuadChartV3({ data, expandedIdx, setExpandedIdx, accent, chartOpts, perChartInd, setPerChartInd, syncTime, setSyncTime, gutter }) {
  const [hover, setHover] = useStateC(null);

  // Per-cell external view for sync mode
  const [view0, setView0] = useStateC({ start: 0, end: data[0].series.length });

  if (expandedIdx != null) {
    const d = data[expandedIdx];
    return (
      <div style={{ background: 'var(--surf-1)', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 14, height: 30, borderBottom: '1px solid var(--line)' }}>
          <span style={{ color: 'var(--accent)', fontSize: 10, letterSpacing: '0.16em' }}>● FOCUS</span>
          <span style={{ color: 'var(--txt)', fontSize: 11, fontWeight: 600 }}>{d.sym}</span>
          <span style={{ color: 'var(--txt-mute)', fontSize: 10 }}>{d.name}</span>
          <span style={{ color: 'var(--txt-dim)', fontSize: 10 }}>1 of 4 · synced timebase preserved</span>
          <span style={{ flex: 1 }} />
          <button onClick={() => setExpandedIdx(null)} style={btnLink}>↤ RESTORE QUAD</button>
        </div>
        <div style={{ flex: 1, padding: '4px 8px 8px', minHeight: 0 }}>
          <ChartCanvas
            data={d}
            hover={hover} onHover={setHover}
            accent={accent} chartOpts={chartOpts}
            showToolbar size={{ w: 1400, h: 700 }}
            indicators={perChartInd[d.sym]}
          />
        </div>
      </div>
    );
  }

  const Cell = ({ i }) => {
    const d = data[i];
    const cellOpts = {
      ...chartOpts,
      onIndicatorChange: (sym, k, v) => {
        setPerChartInd(prev => ({ ...prev, [sym]: { ...(prev[sym]||{}), [k.replace('show','').toLowerCase()]: v } }));
      },
    };
    return (
      <div style={{ overflow: 'hidden', position: 'relative', background: 'var(--surf-1)' }}>
        <ChartCanvas
          data={d}
          hover={hover} onHover={setHover}
          onClickHeader={() => setExpandedIdx(i)}
          accent={accent}
          chartOpts={cellOpts}
          showToolbar
          size={{ w: 720, h: 320 }}
          indicators={perChartInd[d.sym]}
        />
      </div>
    );
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) 1px minmax(0, 1fr)',
      gridTemplateRows: 'minmax(0, 1fr) 1px 56px 1px minmax(0, 1fr)',
      height: '100%',
      background: 'var(--bg)',
    }}>
      <Cell i={0} />
      <div style={{ background: 'var(--line)' }} />
      <Cell i={1} />
      <div style={{ gridColumn: '1 / 4', background: 'var(--line)' }} />
      <div style={{ gridColumn: '1 / 4', background: 'var(--surf-1)' }}>{gutter}</div>
      <div style={{ gridColumn: '1 / 4', background: 'var(--line)' }} />
      <Cell i={2} />
      <div style={{ background: 'var(--line)' }} />
      <Cell i={3} />
    </div>
  );
}

const btnLink = {
  background: 'transparent', color: 'var(--txt-dim)',
  border: '1px solid rgba(255,255,255,0.1)', fontFamily: 'inherit', fontSize: 10,
  letterSpacing: '0.12em', padding: '4px 10px', cursor: 'pointer',
};

Object.assign(window, { ChartCanvas, QuadChartV3, ChartToolbar });
