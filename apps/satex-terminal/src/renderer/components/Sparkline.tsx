/**
 * SATEX — Inline SVG sparkline with optional filled area.
 */
import { seriesExtent } from '../lib/extent'

interface Props {
  data: number[]
  width?: number
  height?: number
  positive?: boolean
  area?: boolean
}

export function Sparkline({ data, width = 60, height = 22, positive, area = true }: Props) {
  if (!data || data.length < 2) return <svg width={width} height={height} />
  // Filter non-finite values defensively — a single NaN/Infinity poisons min/max
  // and renders the entire sparkline as a flat line at the chart top.
  const clean = data.filter(Number.isFinite)
  if (clean.length < 2) return <svg width={width} height={height} />
  const { min, max } = seriesExtent(clean)
  const span = (max - min) || 1
  const step = width / (clean.length - 1)
  const pts = clean.map((v, i) =>
    `${(i * step).toFixed(2)},${(height - ((v - min) / span) * height).toFixed(2)}`
  ).join(' ')
  const isUp  = positive !== undefined ? positive : clean[clean.length - 1]! >= clean[0]!
  const stroke = isUp ? 'var(--bull-glow)' : 'var(--bear-glow)'
  const fill   = isUp ? 'var(--bull-soft)' : 'var(--bear-soft)'
  const areaPath = `M0,${height} L ${pts.replaceAll(' ', ' L ')} L ${width},${height} Z`
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {area && <path d={areaPath} fill={fill} />}
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
