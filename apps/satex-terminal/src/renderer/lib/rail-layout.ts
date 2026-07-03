/**
 * SATEX — Side-rail collapse layout (pure, headless).
 *
 * Operator ask, 2026-07-02 (appended to the Intel-workspace ultraplan, Phase D
 * polish): every side module — Watchlist, Depth, Regime, Exec, News, Risk,
 * Logs, Health — collapses *fully*, the same interaction model as
 * `FundedAccountPanel`'s existing header toggle, except the pane's grid track
 * must shrink to a thin re-open handle and yield its space back to whichever
 * sibling track is flexible — never a dead gutter (a bare `display:none` that
 * leaves the track width behind is explicitly the wrong-first-attempt this
 * spec calls out).
 *
 * All track-sizing math lives here, headless, so it is unit-tested the same
 * way `grid-layout.ts` tests the Intel grid reducer. The App shell only calls
 * `computeRailTemplate` and joins the result with the `1px` divider tracks it
 * already renders between panels.
 */

/** One track in a rail stack (a column list or a row list). `flex` marks a
 *  track that is *already* flexible in its expanded state today (an existing
 *  `minmax(0, 1fr)` track, e.g. ExecTicket / the catalysts-risk pair) — vs. a
 *  track that is normally a fixed pixel size (e.g. Watchlist's 224px). */
export interface RailTrackSpec {
  id: string
  /** CSS track-size when expanded and not the promoted flex sink, e.g. '288px'. */
  expandedSize: string
  /** True when this track is `minmax(0, 1fr)` (or equivalent) in its normal,
   *  nothing-collapsed state. */
  flex: boolean
}

/** The CSS track size rendered for a fully-collapsed rail — a thin, always
 *  reachable re-open handle (never zero — a zero-width track cannot host a
 *  click target and would strand the control, the same rule as the kill-chord
 *  reachability invariant). */
export const RAIL_HANDLE_SIZE = '28px'

const FLEX_SINK = 'minmax(0, 1fr)'

/**
 * Compute the per-track CSS sizes for a rail stack.
 *
 * Rule: any track whose id is in `collapsed` renders as the thin handle.
 * Every other track keeps its natural size — UNLESS none of the stack's
 * naturally-flexible tracks survived collapse, in which case the *last*
 * non-collapsed track is promoted to the flex sink so the freed space always
 * has somewhere to go (no dead gutter, Constitution off-perimeter view-state
 * change only). When every track is collapsed there is nothing left to feed
 * space to, so no promotion happens — the whole stack is just handles.
 *
 * Pure, no DOM, no clock — the same headless-reducer idiom as
 * `grid-layout.ts`. The caller joins the returned sizes with its own '1px'
 * divider tracks (dividers are not modeled here; they never collapse).
 */
export function computeRailTemplate(
  specs: readonly RailTrackSpec[],
  collapsed: ReadonlySet<string>,
): string[] {
  const openFlexExists = specs.some((s) => s.flex && !collapsed.has(s.id))

  let sinkIndex = -1
  if (!openFlexExists) {
    for (let i = specs.length - 1; i >= 0; i--) {
      if (!collapsed.has(specs[i]!.id)) { sinkIndex = i; break }
    }
  }

  return specs.map((s, i) => {
    if (collapsed.has(s.id)) return RAIL_HANDLE_SIZE
    if (i === sinkIndex) return FLEX_SINK
    return s.flex ? FLEX_SINK : s.expandedSize
  })
}

/** True when applying `collapsed` to `specs` would change the default,
 *  nothing-collapsed template — lets the caller skip the inline `style`
 *  override entirely (and inherit the plain CSS default byte-for-byte) when
 *  nothing on this rail stack is collapsed. Zero behavioral or visual change
 *  in the common case. */
export function railTemplateIsDefault(
  specs: readonly RailTrackSpec[],
  collapsed: ReadonlySet<string>,
): boolean {
  return !specs.some((s) => collapsed.has(s.id))
}
