/**
 * SATEX — Funded account registry.
 * v1 exposes the Topstep $50K XFA preset. New profiles register here.
 */
import { TOPSTEP_50K_XFA } from './topstep-50k-xfa'
import type { FundedAccountProfile } from './types'

export * from './types'
export { TOPSTEP_50K_XFA }

const REGISTRY: Record<string, FundedAccountProfile> = {
  [TOPSTEP_50K_XFA.id]: TOPSTEP_50K_XFA,
}

/** Look up a profile by id. Returns null if unknown — caller decides whether
 *  to default to "no profile active" or to error. */
export function getProfile(id: string): FundedAccountProfile | null {
  return REGISTRY[id] ?? null
}

/** All known profile ids (for the renderer's profile picker). */
export function listProfileIds(): string[] {
  return Object.keys(REGISTRY)
}
