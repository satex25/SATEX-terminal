/**
 * SATEX — Deterministic PRNG (mulberry32)
 * No use of Math.random() anywhere in the simulator path.
 * Same seed → identical tick stream across runs and Node versions.
 */
export interface Rng {
  next(): number
  nextGaussian(): number
  nextInt(max: number): number
}

export function mulberry32(seed: number): Rng {
  let s = seed >>> 0
  function next(): number {
    s |= 0; s = s + 0x6D2B79F5 | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  // Box-Muller transform for Gaussian samples
  let _spare: number | null = null
  function nextGaussian(): number {
    if (_spare !== null) { const v = _spare; _spare = null; return v }
    let u: number, v: number, s: number
    do { u = next() * 2 - 1; v = next() * 2 - 1; s = u * u + v * v } while (s >= 1 || s === 0)
    const mul = Math.sqrt(-2 * Math.log(s) / s)
    _spare = v * mul
    return u * mul
  }
  function nextInt(max: number): number {
    return Math.floor(next() * max)
  }
  return { next, nextGaussian, nextInt }
}

export function randomSeed(): number {
  return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0
}
