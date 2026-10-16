// X01 rules (SPEC.md section 6).
//
// Like Round the World, this is pure: `applyX01(state, input)` returns a new
// state, and a game is rebuilt by replaying its stored inputs in order.
//
// Two ways to enter scores:
// - per dart: each dart is one input (segment + multiplier)
// - per visit: the whole visit's total is one input, with how many darts
//   were used and how many were thrown at a finishing double.

import { assignPlaces } from './places'
import { BULL, type BullType, type Multiplier, type Phase, type Placing } from './types'

export interface X01Settings {
  start: 301 | 501
  doubleIn: boolean
  doubleOut: boolean
  inputMode: 'dart' | 'visit'
}

export const DEFAULT_X01_SETTINGS: X01Settings = { start: 501, doubleIn: false, doubleOut: true, inputMode: 'dart' }

/** Sudden-death legs always start here, double-out, no double-in. */
export const SUDDEN_DEATH_START = 170

export type X01Input =
  | { kind: 'dart'; segment: number | null; multiplier: Multiplier }
  | { kind: 'visit'; total: number; dartsUsed: number; dartsAtDouble: number }

export interface X01PlayerState {
  playerId: string
  /** Score left in the current leg (or in the leg they last played). */
  score: number
  /** Score at the start of the current visit, to go back to on a bust. */
  visitStartScore: number
  /** Double-in: has this player hit their opening double yet? */
  opened: boolean
  openedAtVisitStart: boolean
  /** Checked out in the main leg (leg 1). */
  finished: boolean
  /** Score left at the end of the main leg, for ranking non-finishers. */
  mainLegScore: number
  /** Darts thrown in the main leg up to and including the checkout. */
  mainLegDarts: number
  out: boolean
  /** The leg (2, 3 …) in which this player was knocked out of sudden death. */
  suddenDeathOutLeg: number | null
}

export interface X01State {
  settings: X01Settings
  players: X01PlayerState[] // throwing order
  status: 'in_progress' | 'finished'
  phase: Phase
  /** 1 = main game, 2+ = sudden-death legs. */
  leg: number
  legStart: number
  legDoubleIn: boolean
  /** Visit round within the current leg, from 1. */
  round: number
  current: number
  dartInVisit: number
  /** Points scored so far in the current visit (counted points only). */
  visitPoints: number
  /** Players who checked out in this round of this leg. */
  checkedOut: string[]
  /** What the last input did, so the screen can show it. */
  lastEvent: 'bust' | 'checkout' | null
  winnerId: string | null
  ranking: Placing[]
  dartCount: number
}

export interface X01NextDart {
  playerId: string
  leg: number
  round: number
  dartInVisit: number
  phase: Phase
  seq: number
}

// ---------------------------------------------------------------------------
// Single darts

export function dartPoints(segment: number | null, multiplier: Multiplier): number {
  if (segment == null || multiplier === 0) return 0
  return segment * multiplier // outer bull 25 x1 = 25, inner bull 25 x2 = 50
}

/** A double, or the inner bull (which counts as double 25). */
export const isDouble = (segment: number | null, multiplier: Multiplier) => segment != null && multiplier === 2

export function bullTypeOf(segment: number | null, multiplier: Multiplier): BullType {
  if (segment !== BULL || multiplier === 0) return null
  return multiplier === 2 ? 'inner' : 'outer'
}

export function validateDart(segment: number | null, multiplier: Multiplier) {
  if (multiplier === 0) return
  if (segment == null) throw new Error('A scoring dart needs a number')
  if (segment === BULL) {
    if (multiplier === 3) throw new Error('There is no treble bull')
    return
  }
  if (!Number.isInteger(segment) || segment < 1 || segment > 20) throw new Error(`No such number: ${segment}`)
}

/** Visit totals that three darts cannot make. */
export const IMPOSSIBLE_VISIT_TOTALS = [163, 166, 169, 172, 173, 175, 176, 178, 179]

/** Can this score be finished on a double (or inner bull) with one dart? */
export const isFinishingDouble = (score: number) => score === 50 || (score >= 2 && score <= 40 && score % 2 === 0)

// ---------------------------------------------------------------------------
// Game flow

export function createX01Game(playerIds: string[], settings: X01Settings): X01State {
  if (playerIds.length < 1) throw new Error('A game needs at least one player')
  if (new Set(playerIds).size !== playerIds.length) throw new Error('Each player can only be in a game once')
  return {
    settings,
    players: playerIds.map((playerId) => ({
      playerId,
      score: settings.start,
      visitStartScore: settings.start,
      opened: !settings.doubleIn,
      openedAtVisitStart: !settings.doubleIn,
      finished: false,
      mainLegScore: settings.start,
      mainLegDarts: 0,
      out: false,
      suddenDeathOutLeg: null,
    })),
    status: 'in_progress',
    phase: 'normal',
    leg: 1,
    legStart: settings.start,
    legDoubleIn: settings.doubleIn,
    round: 1,
    current: 0,
    dartInVisit: 1,
    visitPoints: 0,
    checkedOut: [],
    lastEvent: null,
    winnerId: null,
    ranking: [],
    dartCount: 0,
  }
}

export function x01NextDart(s: X01State): X01NextDart | null {
  if (s.status === 'finished') return null
  return {
    playerId: s.players[s.current].playerId,
    leg: s.leg,
    round: s.round,
    dartInVisit: s.dartInVisit,
    phase: s.phase,
    seq: s.dartCount + 1,
  }
}

/** Double-out is always on in sudden-death legs. */
const doubleOutNow = (s: X01State) => s.leg > 1 || s.settings.doubleOut

export function applyX01(prev: X01State, input: X01Input): X01State {
  if (prev.status === 'finished') throw new Error('The game is over')
  const s: X01State = structuredClone(prev)
  s.dartCount++
  s.lastEvent = null
  const p = s.players[s.current]
  const doubleOut = doubleOutNow(s)

  if (input.kind === 'visit') {
    if (s.dartInVisit !== 1) throw new Error('A visit total can only be entered at the start of a visit')
    const { total, dartsUsed } = input
    if (!Number.isInteger(total) || total < 0 || total > 180 || IMPOSSIBLE_VISIT_TOTALS.includes(total)) {
      throw new Error(`${total} is not a possible visit score`)
    }
    if (dartsUsed < 1 || dartsUsed > 3) throw new Error('Darts used must be 1-3')
    if (s.leg === 1) p.mainLegDarts += total === p.score ? dartsUsed : 3
    // With double-in, the total entered is what counted, so any score opens.
    if (total > 0) p.opened = true
    const left = p.score - total
    if (left < 0 || (doubleOut && left === 1)) return bust(s, p)
    p.score = left
    s.visitPoints = total
    if (left === 0) return checkout(s, p)
    return endVisit(s)
  }

  validateDart(input.segment, input.multiplier)
  if (s.leg === 1) p.mainLegDarts++
  let points = dartPoints(input.segment, input.multiplier)
  const dbl = isDouble(input.segment, input.multiplier)
  if (!p.opened) {
    if (dbl) p.opened = true
    else points = 0 // nothing counts before the opening double
  }
  const left = p.score - points
  if (left < 0 || (doubleOut && left === 1) || (doubleOut && left === 0 && !dbl)) return bust(s, p)
  p.score = left
  s.visitPoints += points
  if (left === 0) return checkout(s, p)
  if (s.dartInVisit === 3) return endVisit(s)
  s.dartInVisit++
  return s
}

function bust(s: X01State, p: X01PlayerState): X01State {
  p.score = p.visitStartScore
  p.opened = p.openedAtVisitStart
  s.lastEvent = 'bust'
  return endVisit(s)
}

function checkout(s: X01State, p: X01PlayerState): X01State {
  s.lastEvent = 'checkout'
  s.checkedOut.push(p.playerId)
  if (s.leg === 1) p.finished = true
  if (s.phase === 'normal') s.phase = 'redemption'
  return endVisit(s)
}

function endVisit(s: X01State): X01State {
  s.dartInVisit = 1
  s.visitPoints = 0
  const inLeg = s.players.map((p, i) => ({ p, i })).filter(({ p }) => !p.out)
  const next = inLeg.find(({ i }) => i > s.current)
  if (next) {
    s.current = next.i
    startVisit(s)
    return s
  }
  // Round over: everyone still in this leg has had the same number of visits.
  const finishers = s.checkedOut
  if (finishers.length === 0) {
    s.round++
    s.current = inLeg[0].i
    startVisit(s)
    return s
  }
  if (s.leg === 1) for (const p of s.players) p.mainLegScore = p.score
  for (const { p } of inLeg) {
    if (finishers.includes(p.playerId)) continue
    p.out = true
    if (s.leg > 1) p.suddenDeathOutLeg = s.leg
  }
  if (finishers.length === 1) return finishGame(s, finishers[0])

  // Two or more checked out in the same round: a new 170 leg between them.
  s.leg++
  s.legStart = SUDDEN_DEATH_START
  s.legDoubleIn = false
  s.phase = 'sudden_death'
  s.round = 1
  s.checkedOut = []
  for (const p of s.players) {
    if (p.out) continue
    p.score = SUDDEN_DEATH_START
    p.opened = true
  }
  s.current = s.players.findIndex((p) => !p.out)
  startVisit(s)
  return s
}

function startVisit(s: X01State) {
  const p = s.players[s.current]
  p.visitStartScore = p.score
  p.openedAtVisitStart = p.opened
}

function finishGame(s: X01State, winnerId: string): X01State {
  s.status = 'finished'
  s.winnerId = winnerId
  s.ranking = rankX01(s.players, winnerId)
  return s
}

/** Winner; then sudden-death losers (later leg ranks higher); then lowest score left. */
export function rankX01(players: X01PlayerState[], winnerId: string): Placing[] {
  return assignPlaces(
    players.map((p) => ({
      id: p.playerId,
      key: p.playerId === winnerId ? [0] : p.finished ? [1, -(p.suddenDeathOutLeg ?? 0)] : [2, p.mainLegScore],
    })),
  )
}

export function replayX01(playerIds: string[], settings: X01Settings, inputs: X01Input[]): X01State {
  return inputs.reduce(applyX01, createX01Game(playerIds, settings))
}
