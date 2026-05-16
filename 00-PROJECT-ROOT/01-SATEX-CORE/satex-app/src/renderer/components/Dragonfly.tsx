/**
 * SATEX — Brand Mark (Meridian, 2026-05-16)
 *
 * The "Meridian" design language for the SATEX mark. A vertical body
 * (shaft) crossed by two horizontal wing-ellipses with a circular head
 * dot, all enclosed in a rounded-square panel. Conceptually a stylized
 * dragonfly (history-kept name); visually closer to a meridian marker
 * or compass mark.
 *
 * Geometry comes from logos-final/satex-meridian-*.svg (256×256 viewBox).
 * Inlined here so there's no Vite asset-copy step and no FOUC on first
 * paint — the SVG renders synchronously with the first React commit.
 *
 * Three brand palettes are supported. `crimson` is the SATEX house
 * default — closest match to the legacy red mark and highest contrast
 * on the dark Black Box UI. Pass `variant="ember"` for the dark/red
 * stealth look or `variant="vault"` for the deep wine canonical palette
 * (matches logos-final/satex-logo.svg).
 *
 * Sizing note: the source design is hero-scale. Features (shaft 5.2 px,
 * wing ry 4.8-5.8 px, head r 6.2 px in 256 viewBox) read at ≥24 px on
 * screen. TopBar.tsx passes size={28} which lands every element crisply
 * inside the 40 px row.
 */

export type DragonflyVariant = 'crimson' | 'ember' | 'vault'

interface Props {
  size?: number
  variant?: DragonflyVariant
  /** Optional per-instance className for layout overrides. */
  className?: string
  /** Decorative by default (aria-hidden). Pass a label to expose to AT. */
  title?: string
}

const PALETTES: Record<DragonflyVariant, { bg: string; fg: string }> = {
  // Cream-on-crimson — house default. Pops on the dark UI; carries
  // the legacy red brand recognition forward.
  crimson: { bg: '#8F1620', fg: '#FCE5D2' },
  // Red-on-near-black — stealth/ember look. Use on light backgrounds
  // or when the panel itself should fade into the dark chrome.
  ember:   { bg: '#140307', fg: '#E11D2A' },
  // Cream-on-dark-wine — canonical satex-logo.svg palette.
  vault:   { bg: '#4A0810', fg: '#F2E3D2' },
}

export function Dragonfly({
  size = 28,
  variant = 'crimson',
  className,
  title,
}: Props) {
  const { bg, fg } = PALETTES[variant]
  const a11y = title
    ? { role: 'img', 'aria-label': title }
    : { 'aria-hidden': true as const, focusable: false as const }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="geometricPrecision"
      className={className}
      style={{ display: 'block', flexShrink: 0 }}
      {...a11y}
    >
      {title && <title>{title}</title>}
      <rect width="256" height="256" rx="44" fill={bg} />
      <g fill={fg}>
        {/* Upper wing — widest, sits near the head */}
        <ellipse cx="128" cy="92"  rx="94" ry="5.8" />
        {/* Lower wing — narrower, supports the body axis */}
        <ellipse cx="128" cy="118" rx="70" ry="4.8" />
        {/* Head dot — anchors the vertical axis */}
        <circle  cx="128" cy="30"  r="6.2" />
        {/* Body shaft — the meridian line, runs from just below head
            to the lower frame edge */}
        <rect    x="125.4" y="38" width="5.2" height="190" rx="2.6" />
      </g>
    </svg>
  )
}
