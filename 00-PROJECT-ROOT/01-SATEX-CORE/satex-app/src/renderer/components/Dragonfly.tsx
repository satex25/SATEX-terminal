/**
 * SATEX — Dragonfly Logo (Phase 10 · Black Box)
 *
 * 9×9 pixel-art dragonfly inside a red rounded square. Ports the SVG glyph
 * from mc4 (1)/satex-panels.jsx:29 verbatim — visual identity locked.
 */

interface Props { size?: number }

const PIXELS = [
  '....x....',
  '...xxx...',
  '..xxxxx..',
  'xxxxxxxxx',
  '...xxx...',
  'xxxxxxxxx',
  '..xxxxx..',
  '...xxx...',
  '....x....',
] as const

export function Dragonfly({ size = 20 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 13 13" style={{ display: 'block', flexShrink: 0 }}>
      <rect x="0" y="0" width="13" height="13" rx="1.6" fill="#e23744" />
      <g fill="#fff" opacity="0.96">
        {PIXELS.flatMap((row, y) =>
          [...row].map((ch, x) => ch === 'x'
            ? <rect key={`${x},${y}`} x={x + 2} y={y + 2} width="1" height="1" />
            : null
          )
        )}
      </g>
    </svg>
  )
}
