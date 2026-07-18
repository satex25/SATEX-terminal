/**
 * SATEX — Inline SVG icon set.
 * Stroke-based, currentColor — inherits from parent.
 */
import type { JSX } from 'react' // React 19 removed the global JSX namespace

interface Props {
  name: 'settings' | 'expand' | 'close' | 'plus' | 'search' | 'bolt' | 'sparkles' | 'drag' | 'chart' | 'eye' | 'eyeoff'
  size?: number
}

export function Icon({ name, size = 14 }: Props) {
  const paths: Record<Props['name'], JSX.Element> = {
    settings: <path d="M12 9a3 3 0 100 6 3 3 0 000-6zm7.4 3a7.4 7.4 0 00-.06-.93l2-1.55-2-3.46-2.36.95a7.5 7.5 0 00-1.6-.93l-.36-2.5h-4l-.36 2.5a7.5 7.5 0 00-1.6.93l-2.36-.95-2 3.46 2 1.55c-.04.3-.06.61-.06.93s.02.62.06.93l-2 1.55 2 3.46 2.36-.95c.5.38 1.03.7 1.6.93l.36 2.5h4l.36-2.5a7.5 7.5 0 001.6-.93l2.36.95 2-3.46-2-1.55c.04-.3.06-.61.06-.93z" stroke="currentColor" fill="none" strokeWidth="1.5"/>,
    expand:   <path d="M4 4h6M4 4v6M20 4h-6M20 4v6M4 20h6M4 20v-6M20 20h-6M20 20v-6" stroke="currentColor" strokeWidth="1.5" fill="none"/>,
    close:    <path d="M6 6l12 12M6 18L18 6" stroke="currentColor" strokeWidth="1.5"/>,
    plus:     <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.5"/>,
    search:   <g stroke="currentColor" fill="none" strokeWidth="1.5"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/></g>,
    bolt:     <path d="M13 2L3 14h7v8l10-12h-7V2z" stroke="currentColor" fill="none" strokeWidth="1.5" strokeLinejoin="round"/>,
    sparkles: <g stroke="currentColor" fill="none" strokeWidth="1.5" strokeLinecap="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></g>,
    drag:     <g fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></g>,
    chart:    <g stroke="currentColor" fill="none" strokeWidth="1.5"><path d="M4 20h16"/><path d="M6 16l4-6 4 4 4-8"/></g>,
    eye:      <g stroke="currentColor" fill="none" strokeWidth="1.5"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></g>,
    eyeoff:   <g stroke="currentColor" fill="none" strokeWidth="1.5"><path d="M2 12s3.5-7 10-7c2 0 3.7.6 5.2 1.5M22 12s-3.5 7-10 7c-2 0-3.7-.6-5.2-1.5"/><path d="M3 3l18 18"/></g>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24">{paths[name]}</svg>
}
