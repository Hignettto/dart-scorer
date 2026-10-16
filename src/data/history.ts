// Helpers for the match history screens.

import { BULL } from '../engine/types'
import type { Dart } from './db'

/** Short text for one dart: "T7", "D20", "S3", "Outer", "Inner", or "Miss". */
export function dartLabel(d: Pick<Dart, 'segment' | 'multiplier' | 'bullType' | 'visitTotal'>): string {
  if (d.visitTotal != null) return `${d.visitTotal}` // X01 visit entered as a total
  if (d.multiplier === 0 || d.segment == null) return 'Miss'
  if (d.segment === BULL) return d.bullType === 'inner' || d.multiplier === 2 ? 'Inner' : 'Outer'
  return `${['', 'S', 'D', 'T'][d.multiplier]}${d.segment}`
}

export interface Visit {
  playerId: string
  round: number
  leg: number
  phase: Dart['phase']
  darts: Dart[]
}

/** Groups a game's darts (in seq order) into visits. */
export function groupVisits(darts: Dart[]): Visit[] {
  const visits: Visit[] = []
  for (const d of darts) {
    const last = visits[visits.length - 1]
    if (last && last.playerId === d.playerId && last.round === d.round && last.leg === d.leg && d.dartInVisit > 1) {
      last.darts.push(d)
    } else {
      visits.push({ playerId: d.playerId, round: d.round, leg: d.leg, phase: d.phase, darts: [d] })
    }
  }
  return visits
}
