/**
 * SATEX — Circular progress ring (SVG).
 */
interface Props {
  value: number          // 0..100
  label?: string
  size?: number
  color?: string
}

export function Ring({ value, label = '', size = 80, color = 'var(--accent)' }: Props) {
  const r = (size - 10) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(100, value))
  const off = c - (v / 100) * c
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`}>
        <circle className="ring-bg" cx={size / 2} cy={size / 2} r={r} />
        <circle className="ring-fg" cx={size / 2} cy={size / 2} r={r}
          style={{ stroke: color, strokeDasharray: c, strokeDashoffset: off }} />
      </svg>
      <div className="ring-text">
        <div className="v">{Math.round(v)}</div>
        {label && <div className="l">{label}</div>}
      </div>
    </div>
  )
}
