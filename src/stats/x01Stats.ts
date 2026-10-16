// X01 stats for one player (SPEC.md section 7), and the per-dart details the
// CSV export needs. Everything is worked out by replaying the stored darts.

import type { AllData } from '../data/backup'
import type { Dart } from '../data/db'
import { x01InputFromDart } from '../data/games'
import { applyX01, createX01Game, dartPoints, isFinishingDouble, type X01Settings } from '../engine/x01'

export interface X01DartDetail {
  dart: Dart
  points: number // raw points of the dart (segment x multiplier), or the visit total
  scoreBefore: number
  scoreAfter: number // on a busting dart: the score at the start of the visit
  visitBust: boolean
  checkout: boolean
  /** Darts thrown at a finishing double (0/1 for a dart; the entered count for a visit). */
  atDouble: number
}

export interface X01Visit {
  playerId: string
  leg: number
  darts: number
  scored: number // 0 for a bust
  bust: boolean
  checkout: boolean
  atDouble: number
}

/** Replays one X01 game and describes every stored dart and every visit. */
export function x01Details(order: string[], settings: X01Settings, darts: Dart[]) {
  let s = createX01Game(order, settings)
  const details: X01DartDetail[] = []
  const visits: X01Visit[] = []
  let visit: X01Visit | null = null
  let visitDetails: X01DartDetail[] = []

  for (const d of darts) {
    const p = s.players[s.current]
    const before = p.score
    const doubleOut = s.leg > 1 || settings.doubleOut
    const startOfVisit = s.dartInVisit === 1
    if (startOfVisit) {
      visit = { playerId: p.playerId, leg: s.leg, darts: 0, scored: 0, bust: false, checkout: false, atDouble: 0 }
      visitDetails = []
      visits.push(visit)
    }
    const input = x01InputFromDart(d)
    const atDouble =
      input.kind === 'visit' ? input.dartsAtDouble : doubleOut && p.opened && isFinishingDouble(before) ? 1 : 0
    const startScore = p.visitStartScore
    s = applyX01(s, input)
    const after = s.players.find((q) => q.playerId === p.playerId)!.score
    const bust = s.lastEvent === 'bust'
    const checkout = s.lastEvent === 'checkout'
    const detail: X01DartDetail = {
      dart: d,
      points: input.kind === 'visit' ? input.total : dartPoints(input.segment, input.multiplier),
      scoreBefore: before,
      scoreAfter: after,
      visitBust: bust,
      checkout,
      atDouble,
    }
    details.push(detail)
    visitDetails.push(detail)
    visit!.darts += input.kind === 'visit' ? (checkout ? input.dartsUsed : 3) : 1
    visit!.atDouble += atDouble
    if (bust) {
      visit!.bust = true
      for (const v of visitDetails) v.visitBust = true
    }
    if (checkout) visit!.checkout = true
    visit!.scored = bust ? 0 : startScore - after
  }
  return { details, visits, state: s }
}

export interface X01Stats {
  played: number
  wins: number
  winPct: number | null
  threeDartAvg: number | null
  first9Avg: number | null
  checkouts: number
  /** Checkouts in double-out legs, for checkout %. */
  doubleCheckouts: number
  dartsAtDouble: number
  checkoutPct: number | null
  highestCheckout: number | null
  tons: number // 100+
  ton40s: number // 140+
  max180s: number
}

export function x01Stats(data: AllData, playerId: string): X01Stats {
  const games = data.games.filter(
    (g) => g.mode === 'x01' && g.status === 'finished' && data.gamePlayers.some((gp) => gp.gameId === g.id && gp.playerId === playerId),
  )
  let wins = 0
  let scored = 0
  let darts = 0
  let f9Scored = 0
  let f9Darts = 0
  let checkouts = 0
  let doubleCheckouts = 0
  let atDouble = 0
  let highest: number | null = null
  let tons = 0
  let ton40s = 0
  let max180s = 0

  for (const g of games) {
    if (g.winnerId === playerId) wins++
    const order = data.gamePlayers
      .filter((gp) => gp.gameId === g.id)
      .sort((a, b) => a.throwOrder - b.throwOrder)
      .map((gp) => gp.playerId)
    const gameDarts = data.darts.filter((d) => d.gameId === g.id).sort((a, b) => a.seq - b.seq)
    const { visits } = x01Details(order, g.settings as unknown as X01Settings, gameDarts)
    const visitsInLeg = new Map<number, number>()
    for (const v of visits) {
      if (v.playerId !== playerId) continue
      scored += v.scored
      darts += v.darts
      const n = (visitsInLeg.get(v.leg) ?? 0) + 1
      visitsInLeg.set(v.leg, n)
      if (n <= 3) {
        f9Scored += v.scored
        f9Darts += v.darts
      }
      atDouble += v.atDouble
      if (v.checkout) {
        checkouts++
        if (v.atDouble > 0) doubleCheckouts++
        highest = Math.max(highest ?? 0, v.scored)
      }
      if (v.scored === 180) max180s++
      else if (v.scored >= 140) ton40s++
      else if (v.scored >= 100) tons++
    }
  }

  return {
    played: games.length,
    wins,
    winPct: games.length ? wins / games.length : null,
    threeDartAvg: darts ? (scored / darts) * 3 : null,
    first9Avg: f9Darts ? (f9Scored / f9Darts) * 3 : null,
    checkouts,
    doubleCheckouts,
    dartsAtDouble: atDouble,
    checkoutPct: atDouble ? doubleCheckouts / atDouble : null,
    highestCheckout: highest,
    tons,
    ton40s,
    max180s,
  }
}
