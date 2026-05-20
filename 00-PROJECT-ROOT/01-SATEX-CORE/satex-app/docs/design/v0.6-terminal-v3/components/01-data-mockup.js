// Deterministic synthetic OHLC + market data for the SATEX Black Box mockup.
// All values are seeded so the mockup looks the same every reload.

const SX = {};

// -- Mulberry32 PRNG --------------------------------------------------------
function mulberry32(seed) {
  return function() {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// -- OHLC series ------------------------------------------------------------
SX.genSeries = function genSeries({seed, n=140, start=100, vol=0.4, drift=0, regime='trend'}) {
  const rnd = mulberry32(seed);
  const out = [];
  let p = start;
  let trend = drift;
  for (let i = 0; i < n; i++) {
    // regime shifts
    if (regime === 'trend' && i % 40 === 0 && i > 0) trend = -trend * 0.7 + (rnd() - 0.5) * drift * 2;
    if (regime === 'chop') trend = (rnd() - 0.5) * drift;
    if (regime === 'breakout' && i === Math.floor(n * 0.55)) trend += drift * 4;

    const o = p;
    const noise = (rnd() - 0.5) * vol;
    const body = trend + noise;
    const c = +(o + body).toFixed(2);
    const hi = +(Math.max(o, c) + Math.abs(rnd() * vol * 0.7)).toFixed(2);
    const lo = +(Math.min(o, c) - Math.abs(rnd() * vol * 0.7)).toFixed(2);
    const v = Math.floor(50000 + rnd() * 250000);
    out.push({ i, o, h: hi, l: lo, c, v });
    p = c;
  }
  return out;
};

// EMA over close
SX.ema = function ema(series, period) {
  const k = 2 / (period + 1);
  let prev = series[0].c;
  return series.map((b, i) => {
    if (i === 0) return prev;
    prev = b.c * k + prev * (1 - k);
    return prev;
  });
};

// VWAP (rolling, simplified)
SX.vwap = function vwap(series) {
  let pv = 0, vv = 0;
  return series.map(b => {
    const typ = (b.h + b.l + b.c) / 3;
    pv += typ * b.v; vv += b.v;
    return pv / vv;
  });
};

// RSI(14)
SX.rsiLast = function rsiLast(series, period=14) {
  let gains = 0, losses = 0;
  for (let i = series.length - period; i < series.length; i++) {
    const ch = series[i].c - series[i-1].c;
    if (ch >= 0) gains += ch; else losses -= ch;
  }
  const rs = gains / (losses || 1e-9);
  return 100 - 100 / (1 + rs);
};

// -- Quad symbols -----------------------------------------------------------
SX.quad = [
  { sym: 'NVDA',  name: 'NVIDIA Corp.',          seed: 7,   start: 962.40,   vol: 0.65,  drift: 0.06,  regime: 'trend',    tf: '5s', exchange: 'NASDAQ' },
  { sym: 'SPY',   name: 'S&P 500 ETF',           seed: 23,  start: 608.20,   vol: 0.12,  drift: 0.015, regime: 'chop',     tf: '5s', exchange: 'NYSE'   },
  { sym: 'ES1!',  name: 'E-mini S&P · Front',    seed: 41,  start: 5793.50,  vol: 1.4,   drift: 0.10,  regime: 'breakout', tf: '5s', exchange: 'CME'    },
  { sym: 'BTCUSD',name: 'Bitcoin · Coinbase',    seed: 113, start: 96420.00, vol: 38,    drift: 2.4,   regime: 'trend',    tf: '5s', exchange: 'CBSE'   },
];

SX.quadData = SX.quad.map(s => {
  const series = SX.genSeries({ seed: s.seed, n: 140, start: s.start, vol: s.vol, drift: s.drift, regime: s.regime });
  return {
    ...s,
    series,
    ema9: SX.ema(series, 9),
    ema21: SX.ema(series, 21),
    vwap: SX.vwap(series),
    rsi: SX.rsiLast(series, 14),
  };
});

// -- Watchlist (full tree) --------------------------------------------------
SX.watchlist = [
  { group: 'FUTURES', items: [
    { sym: 'ES',   name: 'E-mini S&P 500',  last: 5793.36,  chg: -0.32, spark: 12 },
    { sym: 'NQ',   name: 'E-mini Nasdaq',   last: 18367.51, chg: -0.18, spark: 13 },
    { sym: 'CL',   name: 'Crude · WTI',     last:   91.05,  chg: -0.19, spark: 8  },
    { sym: 'GC',   name: 'Gold Futures',    last: 2442.62,  chg: -0.13, spark: 9  },
    { sym: 'ZN',   name: '10Y T-Note',      last:  108.21,  chg: +0.04, spark: 6  },
  ]},
  { group: 'FX · LONDON', items: [
    { sym: 'EURUSD', name: 'Euro · Dollar',     last: 1.0842, chg: +0.12, spark: 10, hot: true },
    { sym: 'GBPUSD', name: 'Cable',             last: 1.2671, chg: +0.21, spark: 12, hot: true },
    { sym: 'USDJPY', name: 'Yen',               last: 152.31, chg: -0.08, spark: 9 },
    { sym: 'AUDUSD', name: 'Aussie',            last: 0.6612, chg: -0.04, spark: 7 },
    { sym: 'USDCNH', name: 'Offshore Yuan',     last: 7.2415, chg: +0.02, spark: 6 },
  ]},
  { group: 'INDICES', items: [
    { sym: 'SPY',  name: 'S&P 500 ETF',     last: 608.67,  chg: +0.03, spark: 11 },
    { sym: 'QQQ',  name: 'Nasdaq 100 ETF',  last: 483.60,  chg: -0.34, spark: 13 },
    { sym: 'DIA',  name: 'Dow Jones ETF',   last: 378.54,  chg: -0.09, spark: 9 },
    { sym: 'IWM',  name: 'Russell 2000',    last: 218.21,  chg: -0.08, spark: 8 },
  ]},
  { group: 'EQUITIES · TECH', items: [
    { sym: 'NVDA', name: 'NVIDIA Corp.',    last: 962.40,  chg: +0.13, spark: 14, hot: true },
    { sym: 'AAPL', name: 'Apple Inc.',      last: 195.21,  chg: -0.05, spark: 8 },
    { sym: 'MSFT', name: 'Microsoft Corp.', last: 429.15,  chg: -0.08, spark: 9 },
    { sym: 'AMZN', name: 'Amazon.com',      last: 218.79,  chg: +0.00, spark: 7 },
    { sym: 'META', name: 'Meta Platforms',  last: 562.44,  chg: +0.00, spark: 6 },
    { sym: 'GOOGL',name: 'Alphabet Inc.',   last: 201.45,  chg: +0.00, spark: 7 },
    { sym: 'AMD',  name: 'Adv. Micro Dev.', last: 168.26,  chg: +0.00, spark: 5 },
    { sym: 'TSLA', name: 'Tesla, Inc.',     last: 244.10,  chg: -0.14, spark: 8 },
  ]},
  { group: 'CRYPTO', items: [
    { sym: 'BTC',  name: 'Bitcoin',         last: 96420.00, chg: +0.42, spark: 14, hot: true },
    { sym: 'ETH',  name: 'Ethereum',        last: 3824.48,  chg: +0.18, spark: 11 },
    { sym: 'SOL',  name: 'Solana',          last:   210.55, chg: +1.04, spark: 13 },
  ]},
];

// -- L2 Order Book ----------------------------------------------------------
SX.book = (() => {
  const mid = 962.40;
  const asks = [], bids = [];
  let aSum = 0, bSum = 0;
  for (let i = 0; i < 9; i++) {
    const p = +(mid + 0.01 + i * 0.01).toFixed(2);
    const sz = Math.floor(200 + Math.random()*0 + (i*0+1) * (1100 - i*80));
    const size = [1201, 842, 1342, 905, 510, 712, 318, 240, 188][i];
    aSum += size;
    asks.push({ p, size, tot: aSum });
  }
  for (let i = 0; i < 9; i++) {
    const p = +(mid - 0.01 - i * 0.01).toFixed(2);
    const size = [905, 1747, 2957, 4204, 5602, 6210, 7041, 8195, 9012][i];
    bSum += size;
    bids.push({ p, size, tot: bSum });
  }
  return { mid, asks, bids };
})();

// -- Catalysts feed ---------------------------------------------------------
SX.catalysts = [
  { t: '06:31:08', sev: 'high', tkr: 'NVDA', msg: 'Block print · 412k @ 962.18 · dark pool tag' },
  { t: '06:29:41', sev: 'med',  tkr: 'SPX',  msg: 'Vol skew flattens · 25Δ put / call diff −1.4σ' },
  { t: '06:27:19', sev: 'low',  tkr: 'GBPUSD', msg: 'BoE: Mann speaks — hawkish tone, gilt yields +3bp' },
  { t: '06:24:02', sev: 'med',  tkr: 'CL',   msg: 'API crude stocks −2.1MM vs −0.9MM cons' },
  { t: '06:18:55', sev: 'low',  tkr: 'BTC',  msg: 'CME basis widens · annualized +9.2%' },
  { t: '06:14:30', sev: 'high', tkr: 'AAPL', msg: 'Halt-Tier 1 lifted · LULD band reset' },
  { t: '06:09:11', sev: 'low',  tkr: 'DXY',  msg: 'Index −0.12 · EU session bid' },
];

// -- Regime metrics ---------------------------------------------------------
SX.regime = {
  liquidity:   { v: 0.74, label: 'DEEP',     trend: +0.04 },
  spread:      { v: 0.18, label: 'TIGHT',    trend: -0.02 },
  volatility:  { v: 0.41, label: 'NORMAL',   trend: +0.06 },
  trend:       { v: 0.62, label: 'TRENDING', trend: +0.11 },
  state:       'EXPANSION · LONDON LIQUIDITY',
  hmm:         [
    { name: 'EXPANSION',    p: 0.58 },
    { name: 'MEAN-REVERT',  p: 0.27 },
    { name: 'COMPRESSION',  p: 0.11 },
    { name: 'CAPITULATION', p: 0.04 },
  ],
};

// -- Top ticker (session-aware) --------------------------------------------
SX.tickers = {
  LONDON: ['EURUSD 1.0842 +0.12','GBPUSD 1.2671 +0.21','DAX 18,420 -0.34','FTSE 8,213 +0.18','BTP 4.21 -0.03','BUND 2.42 +0.01','GBPJPY 192.85 +0.14','EURGBP 0.8557 -0.09','USDCHF 0.8821 +0.02','BRENT 84.21 -0.18'],
  TOKYO:  ['USDJPY 152.31 -0.08','NKY 38,420 +0.42','HSI 17,210 -1.12','CNH 7.2415 +0.02','KOSPI 2,621 +0.31','AUD 0.6612 -0.04','JGB10 0.98 +0.01','SGX-CN 11,420 -0.18','AUDJPY 100.71 +0.02','CSI300 3,521 +0.12'],
  NY:     ['SPY 608.67 +0.03','QQQ 483.60 -0.34','NVDA 962.40 +0.13','AAPL 195.21 -0.05','MSFT 429.15 -0.08','TSLA 244.10 -0.14','BTC 96,420 +0.42','VIX 14.21 -2.14','TLT 89.42 +0.18','DXY 102.41 +0.12'],
};

// -- Markets — extended universe for the Markets page ----------------------
// Each row has its own seeded 60-bar trend so we can render compact sparklines
// inline. Pricing and direction stay consistent with the watchlist.
SX.markets = (function buildMarkets() {
  const universe = [
    { sym: 'BTC',   name: 'Bitcoin',              cat: 'CRY', last: 96420.00, chg: +0.42, vol: 22_400_000, seed: 113 },
    { sym: 'ETH',   name: 'Ethereum',             cat: 'CRY', last:  3824.50, chg: +0.18, vol: 19_800_000, seed: 211 },
    { sym: 'NQ',    name: 'E-mini Nasdaq 100',    cat: 'FUT', last: 18367.51, chg: -0.18, vol:  9_400_000, seed: 53  },
    { sym: 'ES',    name: 'E-mini S&P 500',       cat: 'FUT', last:  5793.36, chg: -0.32, vol:  7_200_000, seed: 41  },
    { sym: 'CL',    name: 'Crude · WTI',          cat: 'FUT', last:    91.05, chg: -0.19, vol:  3_140_000, seed: 67  },
    { sym: 'GC',    name: 'Gold Futures',         cat: 'FUT', last:  2442.62, chg: -0.13, vol:  1_980_000, seed: 89  },
    { sym: 'ETH',   name: 'Ethereum · perp',      cat: 'CRY', last:  3824.50, chg: +0.18, vol:  1_700_000, seed: 173 },
    { sym: 'SPY',   name: 'S&P 500 ETF',          cat: 'IDX', last:   608.67, chg: +0.03, vol: 53_200_000, seed: 23  },
    { sym: 'QQQ',   name: 'Nasdaq 100 ETF',       cat: 'IDX', last:   483.60, chg: -0.34, vol: 45_480_000, seed: 31  },
    { sym: 'NVDA',  name: 'NVIDIA Corp.',         cat: 'EQ',  last:   962.40, chg: +0.13, vol: 38_330_000, seed: 7   },
    { sym: 'TSLA',  name: 'Tesla, Inc.',          cat: 'EQ',  last:   244.10, chg: -0.14, vol: 45_090_000, seed: 19  },
    { sym: 'AAPL',  name: 'Apple Inc.',           cat: 'EQ',  last:   195.21, chg: -0.05, vol: 38_190_000, seed: 11  },
    { sym: 'MSFT',  name: 'Microsoft Corp.',      cat: 'EQ',  last:   429.15, chg: -0.08, vol: 32_170_000, seed: 13  },
    { sym: 'META',  name: 'Meta Platforms',       cat: 'EQ',  last:   562.44, chg: +0.31, vol: 10_750_000, seed: 17  },
    { sym: 'GOOGL', name: 'Alphabet Inc.',        cat: 'EQ',  last:   201.45, chg: -1.18, vol: 38_330_000, seed: 29  },
    { sym: 'AMD',   name: 'Adv. Micro Devices',   cat: 'EQ',  last:   168.26, chg: -0.02, vol: 38_190_000, seed: 37  },
    { sym: 'AMZN',  name: 'Amazon.com',           cat: 'EQ',  last:   218.79, chg: -0.06, vol: 28_500_000, seed: 43  },
    { sym: 'DIA',   name: 'Dow Jones ETF',        cat: 'IDX', last:   378.54, chg: -0.09, vol:  4_930_000, seed: 47  },
  ];
  return universe.map(r => {
    const ser = SX.genSeries({ seed: r.seed, n: 60, start: r.last, vol: Math.max(0.1, Math.abs(r.last) * 0.0012), drift: r.chg / 200, regime: 'trend' });
    return { ...r, spark: ser.map(b => b.c), notional: Math.round(r.last * r.vol) };
  });
})();

// -- Replay sessions catalogue ---------------------------------------------
SX.replaySessions = [
  { id: 'hist_2026-05-19', label: '2026-05-19 · NY · NVDA earnings AMC', dur: '8h 30m', ticks: 2_140_312 },
  { id: 'hist_2026-05-16', label: '2026-05-16 · LDN · CPI miss',         dur: '6h 12m', ticks: 1_842_011 },
  { id: 'hist_2026-05-14', label: '2026-05-14 · TKY · BoJ surprise',     dur: '7h 02m', ticks: 1_910_544 },
  { id: 'hist_2026-05-10', label: '2026-05-10 · NY · FOMC decision',     dur: '5h 48m', ticks: 1_511_802 },
];

// Sessions need their own bookmarks list for the replay timeline.
SX.replayBookmarks = [
  { t: 0.18, label: 'CPI print',         color: 'warn' },
  { t: 0.34, label: 'NVDA halt-lift',    color: 'pos'  },
  { t: 0.41, label: 'Block · 412k',      color: 'acc'  },
  { t: 0.62, label: 'Williams · hawkish',color: 'neg'  },
  { t: 0.71, label: 'EIA crude',         color: 'warn' },
  { t: 0.84, label: 'PoC reclaim',       color: 'pos'  },
];

SX.sessionFor = function sessionFor(utcHours) {
  if (utcHours >= 0 && utcHours < 7)  return 'TOKYO';
  if (utcHours >= 7 && utcHours < 13) return 'LONDON';
  return 'NY';
};

window.SX = SX;

// ---------------------------------------------------------------------------
// Live tick engine — mutates SX state to simulate streaming data.
// Components read from SX.quadData / SX.watchlist / SX.book and re-render
// when the host bumps a tick counter in state.
// ---------------------------------------------------------------------------
SX.tickEngine = (function () {
  let started = false;
  const listeners = new Set();
  let lastBarT = Date.now();

  function step() {
    const now = Date.now();

    // -- Tick each quad chart's last bar (mini random walk) --
    SX.quadData.forEach((q, qi) => {
      const series = q.series;
      const last = series[series.length - 1];
      const noise = (Math.random() - 0.5) * (q.vol * 0.6);
      const newC = +(last.c + noise).toFixed(2);
      last.c = newC;
      last.h = Math.max(last.h, newC);
      last.l = Math.min(last.l, newC);
      last.v += Math.floor(2000 + Math.random() * 5000);

      // Recompute trailing EMAs on the fly (last value only)
      const k9 = 2 / (9 + 1), k21 = 2 / (21 + 1);
      q.ema9[q.ema9.length - 1]  = newC * k9 + q.ema9[q.ema9.length - 2] * (1 - k9);
      q.ema21[q.ema21.length - 1] = newC * k21 + q.ema21[q.ema21.length - 2] * (1 - k21);

      // every 6s, append a fresh bar (shift series so length stays constant)
      if (now - lastBarT > 6000 && qi === SX.quadData.length - 1) {
        // shift all
        SX.quadData.forEach(qq => {
          const s = qq.series;
          const prevC = s[s.length - 1].c;
          const o = prevC;
          const drift = (Math.random() - 0.48) * qq.vol * 0.5;
          const c = +(o + drift).toFixed(2);
          const h = +(Math.max(o, c) + Math.random() * qq.vol * 0.5).toFixed(2);
          const l = +(Math.min(o, c) - Math.random() * qq.vol * 0.5).toFixed(2);
          const v = Math.floor(40000 + Math.random() * 280000);
          s.shift();
          s.push({ i: s[s.length - 1].i + 1, o, h, l, c, v });

          // recompute EMAs for the new last bar
          const kk9 = 2 / (9 + 1), kk21 = 2 / (21 + 1);
          qq.ema9.shift();  qq.ema9.push(c * kk9 + qq.ema9[qq.ema9.length - 1] * (1 - kk9));
          qq.ema21.shift(); qq.ema21.push(c * kk21 + qq.ema21[qq.ema21.length - 1] * (1 - kk21));
          // simplified VWAP — keep array length constant
          const vw = qq.vwap[qq.vwap.length - 1] * 0.98 + ((h + l + c) / 3) * 0.02;
          qq.vwap.shift(); qq.vwap.push(vw);
        });
        lastBarT = now;
      }
    });

    // -- Watchlist tick: small flicker on last price + chg --
    SX.watchlist.forEach(g => {
      g.items.forEach(it => {
        const drift = (Math.random() - 0.5) * Math.abs(it.last) * 0.00018;
        it.last = +(it.last + drift).toFixed(it.last < 10 ? 4 : 2);
        it.chg = +(it.chg + (Math.random() - 0.5) * 0.04).toFixed(2);
        it._flash = drift > 0 ? 'up' : 'dn';
      });
    });

    // -- L2 book follows NVDA mid, with size mutations --
    const newMid = SX.quadData[0].series[SX.quadData[0].series.length - 1].c;
    SX.book.mid = newMid;
    // Re-price ladder symmetric to mid in 0.01 steps
    SX.book.asks.forEach((r, i) => { r.p = +(newMid + 0.01 + i * 0.01).toFixed(2); });
    SX.book.bids.forEach((r, i) => { r.p = +(newMid - 0.01 - i * 0.01).toFixed(2); });
    // Mutate a couple of rows
    const flipRow = (rows) => {
      const i = Math.floor(Math.random() * rows.length);
      rows[i].size = Math.max(50, rows[i].size + Math.floor((Math.random() - 0.5) * 400));
    };
    flipRow(SX.book.asks); flipRow(SX.book.bids);
    flipRow(SX.book.asks); flipRow(SX.book.bids);
    let aT = 0; SX.book.asks.forEach(r => { aT += r.size; r.tot = aT; });
    let bT = 0; SX.book.bids.forEach(r => { bT += r.size; r.tot = bT; });

    // -- Regime metrics drift gently --
    const r = SX.regime;
    ['liquidity','spread','volatility','trend'].forEach(k => {
      r[k].v = Math.max(0.02, Math.min(0.98, r[k].v + (Math.random() - 0.5) * 0.01));
      r[k].trend = +(r[k].trend * 0.95 + (Math.random() - 0.5) * 0.02).toFixed(2);
    });

    listeners.forEach(fn => fn(now));
  }

  return {
    start() {
      if (started) return;
      started = true;
      setInterval(step, 1000);
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();
