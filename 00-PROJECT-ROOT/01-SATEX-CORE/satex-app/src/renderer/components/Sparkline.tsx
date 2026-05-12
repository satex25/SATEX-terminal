/**
 * SATEX — Inline SVG sparkline with optional filled area.
 */
interface Props {
  data: number[]
  width?: number
  height?: number
  positive?: boolean
  area?: boolean
}

export function Sparkline({ data, width = 60, height = 22, positive, area = true }: Props) {
  if (!data || data.length < 2) return <svg width={width} height={height} />
  const min = Math.min(...data), max = Math.max(...data)
  const span = (max - min) || 1
  const step = width / (data.length - 1)
  const pts = data.map((v, i) =>
    `${(i * step).toFixed(2)},${(height - ((v - min) / span) * height).toFixed(2)}`
  ).join(' ')
  const isUp  = positive !== undefined ? positive : data[data.length - 1]! >= data[0]!
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
