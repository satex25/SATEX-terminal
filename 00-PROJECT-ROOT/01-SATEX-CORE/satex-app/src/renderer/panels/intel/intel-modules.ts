/**
 * SATEX — Intel module catalog (pure metadata).
 *
 * The single source of per-module sizing + titles, kept free of React so the
 * layout store and the grid reducer can import it without pulling component
 * code. The React component map lives in `intel-registry.tsx`; the two share
 * the `IntelModuleId` union from `@shared/types`.
 */
import { INTEL_MODULE_IDS, type IntelModuleId, type ModulePlacement } from '@shared/types'
import type { GridSize } from '../../lib/grid-layout'

export interface IntelModuleMeta {
  /** Human title shown in the module header + the Add-module palette. */
  title: string
  /** One-line description shown in the palette. */
  blurb: string
  /** Default size when the module is first added. */
  defaultSize: GridSize
  /** Smallest the operator can resize it to (keeps the viz legible). */
  minSize: GridSize
}

export const MODULE_META: Record<IntelModuleId, IntelModuleMeta> = {
  reliability: {
    title: 'Calibration Reliability',
    blurb: 'Brier score + reliability buckets — is the brain as right as it claims?',
    defaultSize: { w: 6, h: 3 }, minSize: { w: 4, h: 2 },
  },
  attribution: {
    title: 'Feature Attribution',
    blurb: 'Per-feature signed contribution to the current decision score.',
    defaultSize: { w: 6, h: 3 }, minSize: { w: 4, h: 2 },
  },
  regime: {
    title: 'Regime State',
    blurb: 'HMM posterior over EXPANSION / MEAN-REVERT / COMPRESSION / CAPITULATION.',
    defaultSize: { w: 4, h: 3 }, minSize: { w: 3, h: 2 },
  },
  'weight-drift': {
    title: 'Brain Weight Drift',
    blurb: 'How the learned feature weights moved over the session.',
    defaultSize: { w: 4, h: 3 }, minSize: { w: 2, h: 2 },
  },
  correlation: {
    title: 'Cross-Asset Correlation',
    blurb: 'Pairwise return correlation across the focused universe.',
    defaultSize: { w: 6, h: 4 }, minSize: { w: 3, h: 3 },
  },
  microstructure: {
    title: 'Microstructure',
    blurb: 'Order-book imbalance + VPIN read for the focused symbol.',
    defaultSize: { w: 6, h: 2 }, minSize: { w: 3, h: 2 },
  },
  macro: {
    title: 'Macro Context',
    blurb: 'Upcoming macro catalysts + the prevailing regime backdrop.',
    defaultSize: { w: 6, h: 2 }, minSize: { w: 3, h: 2 },
  },
  scenario: {
    title: 'Scenario & Convergence',
    blurb: 'Bull / Bear / Neutral probabilities + the multi-layer convergence tally.',
    defaultSize: { w: 6, h: 3 }, minSize: { w: 4, h: 2 },
  },
}

/** Set of valid ids — handed to the layout sanitizer to drop unknown modules. */
export const KNOWN_MODULE_IDS: ReadonlySet<IntelModuleId> = new Set(INTEL_MODULE_IDS)

export const minSizeOf = (id: IntelModuleId): GridSize => MODULE_META[id].minSize
export const defaultSizeOf = (id: IntelModuleId): GridSize => MODULE_META[id].defaultSize

/**
 * Curated default layout on a 12-column grid — a sensible, non-overlapping
 * arrangement so the Intel tab is valuable out of the box (review revision 3),
 * not a blank canvas. The operator can rearrange or Reset to this at any time.
 */
export const CURATED_DEFAULT_LAYOUT: ModulePlacement[] = [
  { id: 'reliability',    x: 0, y: 0, w: 6, h: 3 },
  { id: 'attribution',    x: 6, y: 0, w: 6, h: 3 },
  { id: 'regime',         x: 0, y: 3, w: 4, h: 3 },
  { id: 'weight-drift',   x: 4, y: 3, w: 4, h: 3 },
  { id: 'scenario',       x: 8, y: 3, w: 4, h: 3 },
  { id: 'correlation',    x: 0, y: 6, w: 6, h: 4 },
  { id: 'macro',          x: 6, y: 6, w: 6, h: 2 },
  { id: 'microstructure', x: 6, y: 8, w: 6, h: 2 },
]
