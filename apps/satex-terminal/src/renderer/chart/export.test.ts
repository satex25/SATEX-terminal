// @vitest-environment jsdom
/**
 * SATEX — chart export characterization suite (P-129 chart-jsdom-harness wave 2).
 *
 * Pins `exportChartPng` (LWC screenshot + WebGL + 2D-overlay compositing, IPC
 * hand-off to main for the filesystem write) and `exportDrawingsSvg` (pure
 * drawing-model → SVG serialisation). `electron`'s `ipcRenderer` is mocked at
 * the module boundary (file-scoped, matches the auto-update.test.ts precedent);
 * the offscreen composite canvas is faked via a `document.createElement` spy
 * scoped to the 'canvas' tag only (real DOM/Image otherwise, jsdom env).
 *
 * Subject `export.ts` is READ-ONLY here (byte-unchanged).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { IChartApi } from 'lightweight-charts'
import type { ViewportTransform } from './overlay/ViewportTransform'
import type {
  Drawing, LineDraw, HLineDraw, VLineDraw, RectDraw, FibDraw, AnnotationDraw,
} from './drawing/DrawingModel'

const CHANNEL = 'satex:chart:pngExport'

vi.mock('electron', () => ({ ipcRenderer: { invoke: vi.fn() } }))

// Imported AFTER the mock is declared so the module sees the stub.
import { exportChartPng, exportDrawingsSvg } from './export'
import { ipcRenderer } from 'electron'

// ── Image mock: data-URL "load" resolves on the next microtask ─────────────────
class MockImage {
  onload: (() => void) | null = null
  onerror: ((e?: unknown) => void) | null = null
  width = 800
  height = 600
  private _src = ''
  get src() { return this._src }
  set src(v: string) {
    this._src = v
    queueMicrotask(() => this.onload?.())
  }
}

// ── Fake offscreen canvas: intercept only document.createElement('canvas') ─────
function makeFakeCanvas(opts: { ctx?: object | null; blob?: Blob | null } = {}) {
  const ctx = opts.ctx === undefined ? { drawImage: vi.fn() } : opts.ctx
  const blob = opts.blob === undefined
    ? new Blob([new Uint8Array([9, 8, 7, 6])], { type: 'image/png' })
    : opts.blob
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
    toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(blob)),
  }
  return { canvas, ctx: ctx as { drawImage: ReturnType<typeof vi.fn> } | null, blob }
}

function spyCanvasCreation(fake: ReturnType<typeof makeFakeCanvas>['canvas']) {
  const real = document.createElement.bind(document) as (tag: string) => HTMLElement
  return vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag === 'canvas') return fake as unknown as HTMLCanvasElement
    return real(tag)
  }) as typeof document.createElement)
}

function makeChart(toDataURL: () => string = () => 'data:image/png;base64,AAA'): IChartApi {
  return { takeScreenshot: vi.fn(() => ({ toDataURL: vi.fn(toDataURL) })) } as unknown as IChartApi
}

const sentinelCanvas = (tag: string): HTMLCanvasElement =>
  ({ __sentinel: tag }) as unknown as HTMLCanvasElement

beforeEach(() => {
  vi.stubGlobal('Image', MockImage)
  vi.mocked(ipcRenderer.invoke).mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('exportChartPng — LWC screenshot failure', () => {
  it('returns false without loading an image when takeScreenshot() throws', async () => {
    const chart = { takeScreenshot: vi.fn(() => { throw new Error('no dom') }) } as unknown as IChartApi
    const ok = await exportChartPng({ chart, overlayCanvas: null, webglCanvas: null })
    expect(ok).toBe(false)
    expect(ipcRenderer.invoke).not.toHaveBeenCalled()
  })

  it('returns false when toDataURL() throws', async () => {
    const chart = makeChart(() => { throw new Error('detached') })
    const ok = await exportChartPng({ chart, overlayCanvas: null, webglCanvas: null })
    expect(ok).toBe(false)
  })
})

describe('exportChartPng — offscreen context unavailable', () => {
  it('returns false when getContext(2d) returns null', async () => {
    const { canvas } = makeFakeCanvas({ ctx: null })
    spyCanvasCreation(canvas)
    const chart = makeChart()
    const ok = await exportChartPng({ chart, overlayCanvas: null, webglCanvas: null })
    expect(ok).toBe(false)
    expect(ipcRenderer.invoke).not.toHaveBeenCalled()
  })
})

describe('exportChartPng — layer compositing', () => {
  it('draws only the LWC base layer when overlay/webgl are both null', async () => {
    const { canvas, ctx } = makeFakeCanvas()
    spyCanvasCreation(canvas)
    const chart = makeChart()
    const ok = await exportChartPng({ chart, overlayCanvas: null, webglCanvas: null })
    expect(ok).toBe(true)
    expect(ctx!.drawImage).toHaveBeenCalledTimes(1)
    expect(ctx!.drawImage.mock.calls[0]).toEqual([expect.anything(), 0, 0])
    expect(canvas.width).toBe(800)
    expect(canvas.height).toBe(600)
  })

  it('draws base + webgl + overlay in order, webgl/overlay scaled to image dims', async () => {
    const { canvas, ctx } = makeFakeCanvas()
    spyCanvasCreation(canvas)
    const chart = makeChart()
    const webgl = sentinelCanvas('webgl')
    const overlay = sentinelCanvas('overlay')
    const ok = await exportChartPng({ chart, overlayCanvas: overlay, webglCanvas: webgl })
    expect(ok).toBe(true)
    expect(ctx!.drawImage).toHaveBeenCalledTimes(3)
    expect(ctx!.drawImage.mock.calls[1]).toEqual([webgl, 0, 0, 800, 600])
    expect(ctx!.drawImage.mock.calls[2]).toEqual([overlay, 0, 0, 800, 600])
  })

  it('swallows a webgl drawImage failure and still composites the overlay + succeeds', async () => {
    const { canvas, ctx } = makeFakeCanvas()
    spyCanvasCreation(canvas)
    const webgl = sentinelCanvas('webgl')
    const overlay = sentinelCanvas('overlay')
    ctx!.drawImage.mockImplementation((img: unknown) => {
      if (img === webgl) throw new Error('context lost')
    })
    const ok = await exportChartPng({ chart: makeChart(), overlayCanvas: overlay, webglCanvas: webgl })
    expect(ok).toBe(true)
    expect(ctx!.drawImage).toHaveBeenCalledTimes(3) // base + failed webgl attempt + overlay
    expect(ctx!.drawImage.mock.calls[2]).toEqual([overlay, 0, 0, 800, 600])
  })

  it('swallows an overlay drawImage failure and still succeeds', async () => {
    const { canvas, ctx } = makeFakeCanvas()
    spyCanvasCreation(canvas)
    const overlay = sentinelCanvas('overlay')
    ctx!.drawImage.mockImplementation((img: unknown) => {
      if (img === overlay) throw new Error('detached')
    })
    const ok = await exportChartPng({ chart: makeChart(), overlayCanvas: overlay, webglCanvas: null })
    expect(ok).toBe(true)
  })
})

describe('exportChartPng — blob + IPC hand-off', () => {
  it('returns false when toBlob() yields null', async () => {
    const { canvas } = makeFakeCanvas({ blob: null })
    spyCanvasCreation(canvas)
    const ok = await exportChartPng({ chart: makeChart(), overlayCanvas: null, webglCanvas: null })
    expect(ok).toBe(false)
    expect(ipcRenderer.invoke).not.toHaveBeenCalled()
  })

  it('returns false when ipcRenderer.invoke rejects (the .catch wall)', async () => {
    const { canvas } = makeFakeCanvas()
    spyCanvasCreation(canvas)
    vi.mocked(ipcRenderer.invoke).mockRejectedValueOnce(new Error('main refused'))
    const ok = await exportChartPng({ chart: makeChart(), overlayCanvas: null, webglCanvas: null })
    expect(ok).toBe(false)
  })

  it('invokes the canonical channel with a timestamped filename and the raw blob bytes', async () => {
    const { canvas } = makeFakeCanvas({ blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }) })
    spyCanvasCreation(canvas)
    vi.mocked(ipcRenderer.invoke).mockResolvedValueOnce(undefined)
    const ok = await exportChartPng({ chart: makeChart(), overlayCanvas: null, webglCanvas: null })
    expect(ok).toBe(true)
    expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1)
    const [channel, payload] = vi.mocked(ipcRenderer.invoke).mock.calls[0] as [string, { filename: string; data: Uint8Array }]
    expect(channel).toBe(CHANNEL)
    expect(payload.filename).toMatch(/^satex-chart-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.png$/)
    expect(Array.from(payload.data)).toEqual([1, 2, 3])
  })

  it('uses a custom filenameStem when provided', async () => {
    const { canvas } = makeFakeCanvas()
    spyCanvasCreation(canvas)
    vi.mocked(ipcRenderer.invoke).mockResolvedValueOnce(undefined)
    await exportChartPng({ chart: makeChart(), overlayCanvas: null, webglCanvas: null, filenameStem: 'btcusd-1m' })
    const [, payload] = vi.mocked(ipcRenderer.invoke).mock.calls[0] as [string, { filename: string }]
    expect(payload.filename).toMatch(/^btcusd-1m-/)
  })
})

// ── exportDrawingsSvg ────────────────────────────────────────────────────────────

const BASE = { symbol: 'BTCUSD', selected: false, locked: false } as const

function makeTransform(over: Partial<ViewportTransform> = {}): ViewportTransform {
  return {
    timeToX: (t: number) => t,
    priceToY: (p: number) => p,
    yToPrice: (y: number) => y,
    xToTime: (x: number) => x,
    rect: { left: 0, top: 0, width: 800, height: 600 },
    isLog: false,
    ...over,
  }
}

function makeChartEl(clientWidth?: number, clientHeight?: number) {
  if (clientWidth === undefined) return {} as unknown as IChartApi // no chartElement()
  return {
    chartElement: () => (clientWidth === null ? null : { clientWidth, clientHeight }),
  } as unknown as IChartApi
}

describe('exportDrawingsSvg — viewBox sizing', () => {
  it('uses chart.chartElement() client dimensions when present', () => {
    const svg = exportDrawingsSvg(makeChartEl(1000, 500), makeTransform(), [])
    expect(svg).toContain('viewBox="0 0 1000 500"')
    expect(svg).toContain('width="1000" height="500"')
  })

  it('falls back to 1200x600 when chartElement is not implemented', () => {
    const svg = exportDrawingsSvg(makeChartEl(), makeTransform(), [])
    expect(svg).toContain('viewBox="0 0 1200 600"')
  })
})

describe('exportDrawingsSvg — hline', () => {
  it('draws a full-width dashed line at priceToY(price), custom color', () => {
    const h: HLineDraw = { ...BASE, id: 'h1', kind: 'hline', price: 42, color: '#ff0000' }
    const svg = exportDrawingsSvg(makeChartEl(800, 600), makeTransform(), [h])
    expect(svg).toContain('<line x1="0" y1="42.00" x2="800" y2="42.00" stroke="#ff0000" stroke-width="1" stroke-dasharray="4 2"/>')
  })

  it('falls back to #888 when color is undefined', () => {
    const h: HLineDraw = { ...BASE, id: 'h1', kind: 'hline', price: 10 }
    const svg = exportDrawingsSvg(makeChartEl(800, 600), makeTransform(), [h])
    expect(svg).toContain('stroke="#888"')
  })
})

describe('exportDrawingsSvg — line', () => {
  it('draws A→B through the transform, custom lineWidth', () => {
    const l: LineDraw = {
      ...BASE, id: 'l1', kind: 'line', extend: false,
      a: { time: 10, price: 20 }, b: { time: 30, price: 40 }, lineWidth: 3,
    }
    const svg = exportDrawingsSvg(makeChartEl(800, 600), makeTransform(), [l])
    expect(svg).toContain('<line x1="10.00" y1="20.00" x2="30.00" y2="40.00" stroke="#888" stroke-width="3"/>')
  })

  it('defaults lineWidth to 1 when unset', () => {
    const l: LineDraw = {
      ...BASE, id: 'l1', kind: 'line', extend: false,
      a: { time: 1, price: 2 }, b: { time: 3, price: 4 },
    }
    const svg = exportDrawingsSvg(makeChartEl(800, 600), makeTransform(), [l])
    expect(svg).toContain('stroke-width="1"/>')
  })
})

describe('exportDrawingsSvg — annotation', () => {
  it('draws text at the anchor with default fontSize and escaped content', () => {
    const a: AnnotationDraw = {
      ...BASE, id: 'a1', kind: 'annotation',
      anchor: { time: 5, price: 6 }, text: `<risk> & "size" 'ok'`,
    }
    const svg = exportDrawingsSvg(makeChartEl(800, 600), makeTransform(), [a])
    expect(svg).toContain('<text x="5.00" y="6.00" fill="#888" font-size="12" font-family="monospace">')
    expect(svg).toContain('&lt;risk&gt; &amp; &quot;size&quot; &apos;ok&apos;</text>')
  })

  it('honours a custom fontSize', () => {
    const a: AnnotationDraw = {
      ...BASE, id: 'a1', kind: 'annotation',
      anchor: { time: 0, price: 0 }, text: 'note', fontSize: 20,
    }
    const svg = exportDrawingsSvg(makeChartEl(800, 600), makeTransform(), [a])
    expect(svg).toContain('font-size="20"')
  })
})

describe('exportDrawingsSvg — raster-only kinds are excluded', () => {
  it('emits no <line>/<text>/<rect> for vline, rect, and fibonacci drawings', () => {
    const v: VLineDraw = { ...BASE, id: 'v1', kind: 'vline', time: 5 }
    const r: RectDraw = {
      ...BASE, id: 'r1', kind: 'rect', fillOpacity: 0.5,
      topLeft: { time: 0, price: 10 }, bottomRight: { time: 10, price: 0 },
    }
    const f: FibDraw = {
      ...BASE, id: 'f1', kind: 'fibonacci',
      high: { time: 0, price: 100 }, low: { time: 10, price: 0 },
    }
    const drawings: Drawing[] = [v, r, f]
    const svg = exportDrawingsSvg(makeChartEl(800, 600), makeTransform(), drawings)
    expect(svg).not.toMatch(/<line|<text|<rect/)
  })

  it('an empty drawing list produces only the wrapper + comment', () => {
    const svg = exportDrawingsSvg(makeChartEl(800, 600), makeTransform(), [])
    const lines = svg.split('\n')
    expect(lines[0]).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">')
    expect(lines[1]).toMatch(/^ {2}<!-- SATEX drawing export/)
    expect(lines[2]).toBe('</svg>')
  })
})
