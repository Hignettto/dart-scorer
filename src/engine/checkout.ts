// Checkout hints for double-out X01 (SPEC.md section 6).
//
// Rather than typing in a 170-row table by hand (and risking typos), this
// searches every possible finish and picks the one darts players usually
// go for: fewest darts, favourite doubles (D20, D16 …), and big trebles or
// easy singles to set it up.

import { BULL } from './types'

export interface Throw {
  segment: number
  multiplier: 1 | 2 | 3
}

export const throwLabel = (t: Throw) =>
  t.segment === BULL ? (t.multiplier === 2 ? 'Bull' : '25') : `${['', 'S', 'D', 'T'][t.multiplier]}${t.segment}`

const value = (t: Throw) => t.segment * t.multiplier

/** Scores that can't be checked out with three darts (spec list). */
export const BOGEY_NUMBERS = [159, 162, 163, 165, 166, 168, 169]

// Preference for the finishing double; lower is better.
const DOUBLE_RANK: Record<number, number> = { 20: 0, 16: 1, 18: 2, 12: 3, 10: 4, 8: 5, 14: 6, 6: 8, 4: 9, [BULL]: 11, 2: 12, 1: 13 }
const doubleCost = (segment: number) => (DOUBLE_RANK[segment] ?? 10) * 0.3

// Cost of a set-up dart: singles are easiest, then big trebles.
function setupCost(t: Throw): number {
  if (t.segment === BULL) return t.multiplier === 1 ? 1.5 : 2
  if (t.multiplier === 1) return 0
  if (t.multiplier === 3) return 1 + (20 - t.segment) * 0.15
  return 4 // a double used as a set-up dart
}

const NUMBERS = [...Array(20).keys()].map((i) => i + 1)
const SETUP_THROWS: Throw[] = [
  ...NUMBERS.flatMap((n) => [1, 2, 3].map((m) => ({ segment: n, multiplier: m as 1 | 2 | 3 }))),
  { segment: BULL, multiplier: 1 },
  { segment: BULL, multiplier: 2 },
]
const FINISHING_THROWS: Throw[] = [...NUMBERS.map((n) => ({ segment: n, multiplier: 2 as const })), { segment: BULL, multiplier: 2 }]

const cache = new Map<string, Throw[] | null>()

/**
 * The suggested finish for `score` with `dartsLeft` darts, or null if it
 * can't be done. Only for double-out games.
 */
export function suggestCheckout(score: number, dartsLeft: number): Throw[] | null {
  if (score < 2 || score > 170 || dartsLeft < 1) return null
  const key = `${score}/${dartsLeft}`
  if (cache.has(key)) return cache.get(key)!
  let best: { route: Throw[]; cost: number } | null = null
  for (let n = 1; n <= Math.min(3, dartsLeft) && !best; n++) {
    for (const route of routes(score, n)) {
      const cost =
        route.slice(0, -1).reduce((c, t) => c + setupCost(t), 0) + doubleCost(route[route.length - 1].segment)
      if (!best || cost < best.cost) best = { route, cost }
    }
  }
  // Throw the bigger set-up dart first, as players usually do.
  const result = best ? [...best.route.slice(0, -1).sort((a, b) => value(b) - value(a)), best.route[best.route.length - 1]] : null
  cache.set(key, result)
  return result
}

/** Every way to score exactly `score` in `n` darts, finishing on a double. */
function* routes(score: number, n: number): Generator<Throw[]> {
  if (n === 1) {
    for (const f of FINISHING_THROWS) if (value(f) === score) yield [f]
    return
  }
  for (const t of SETUP_THROWS) {
    const rest = score - value(t)
    if (rest < 2) continue
    for (const r of routes(rest, n - 1)) yield [t, ...r]
  }
}
