// Round the World rules (SPEC.md section 5).
//
// Everything here is a pure function: it takes the current state and a dart and
// returns a brand new state, without changing the old one. The app never stores
// the game state itself. It stores the darts, and rebuilds the state by replaying
// them with `replayRtw`. Undo is simply "replay all darts except the last one".

import { assignPlaces } from './places'
import { BULL, type BullType, type Multiplier, type Phase, type Placing } from './types'

/** What the player hit, as entered on the four big buttons. */
export type RtwThrow =
  | { kind: 'single' }
  | { kind: 'double' }
  | { kind: 'treble' }
  | { kind: 'miss' }
  | { kind: 'outer' }
  | { kind: 'inner' }

export type RtwThrowKind = RtwThrow['kind']

export interface RtwPlayerState {
  playerId: string
  /** Current target: 1-20, or 25 for Bull. */
  target: number
  finished: boolean
  /** Darts thrown in the main game (normal + redemption), not sudden death. */
  dartsThrown: number
  /** How many darts this player had thrown when they reached their current target. */
  reachedAtDarts: number
  /** Darts taken to finish (counting the finishing dart), or null. */
  dartsToFinish: number | null
  bullType: BullType
  /** True once the player can no longer win. */
  out: boolean
  /** Which sudden-death round knocked this player out (1 = first), or null. */
  suddenDeathOutRound: number | null
}

export interface RtwState {
  players: RtwPlayerState[] // in throwing order
  status: 'in_progress' | 'finished'
  phase: Phase
  /** Visit round number, counting up from 1. Keeps counting through sudden death. */
  round: number
  /** Index (into `players`) of the player throwing now. */
  current: number
  /** 1, 2 or 3: which dart of the visit is next. */
  dartInVisit: number
  /** Sudden-death round number (1 = first), 0 before sudden death. */
  suddenDeathRound: number
  /** Player ids hitting Bull in the current sudden-death round. */
  suddenDeathHits: string[]
  winnerId: string | null
  /** Final placings, filled in when the game ends. */
  ranking: Placing[]
  /** Total darts applied so far (all phases). Used as `seq` for the next dart. */
  dartCount: number
}

/** Everything the app needs to label and store the next dart. */
export interface RtwNextDart {
  playerId: string
  round: number
  dartInVisit: number
  phase: Phase
  target: number
  seq: number
}

/** A stored dart is what was thrown plus the context it was thrown in. */
export interface RtwDartRecord extends RtwNextDart {
  segment: number | null
  multiplier: Multiplier
  bullType: BullType
}

// ---------------------------------------------------------------------------
// Single-dart movement

/**
 * Where a player ends up after one dart, ignoring whose turn it is.
 * This is the rule table at the top of SPEC.md section 5.
 */
export function rtwAdvance(target: number, t: RtwThrow): { target: number; finished: boolean; bullType: BullType } {
  if (t.kind === 'miss') return { target, finished: false, bullType: null }
  if (target === BULL) {
    if (t.kind === 'outer' || t.kind === 'inner') return { target: BULL, finished: true, bullType: t.kind }
    throw new Error(`On Bull, a dart must be outer, inner or miss (got ${t.kind})`)
  }
  if (t.kind === 'outer' || t.kind === 'inner') {
    throw new Error(`Outer/inner bull only applies when the target is Bull (target is ${target})`)
  }
  const step = t.kind === 'single' ? 1 : t.kind === 'double' ? 2 : 3
  // Advancing caps at 20. Bull is only reached by hitting 20 while on 20 (any multiplier).
  if (target === 20) return { target: BULL, finished: false, bullType: null }
  return { target: Math.min(target + step, 20), finished: false, bullType: null }
}

/** Multiplier stored for a throw: 0 miss, 1 single/outer bull, 2 double/inner bull, 3 treble. */
export function rtwMultiplier(t: RtwThrow): Multiplier {
  switch (t.kind) {
    case 'miss':
      return 0
    case 'single':
    case 'outer':
      return 1
    case 'double':
    case 'inner':
      return 2
    case 'treble':
      return 3
  }
}

/** Turns a stored dart back into a throw, so stored games can be replayed. */
export function rtwThrowFromRecord(d: { multiplier: Multiplier; bullType: BullType; target: number }): RtwThrow {
  if (d.multiplier === 0) return { kind: 'miss' }
  if (d.target === BULL) return { kind: d.bullType === 'inner' ? 'inner' : 'outer' }
  return { kind: d.multiplier === 1 ? 'single' : d.multiplier === 2 ? 'double' : 'treble' }
}

// ---------------------------------------------------------------------------
// Game flow

export function createRtwGame(playerIds: string[]): RtwState {
  if (playerIds.length < 1) throw new Error('A game needs at least one player')
  if (new Set(playerIds).size !== playerIds.length) throw new Error('Each player can only be in a game once')
  return {
    players: playerIds.map((playerId) => ({
      playerId,
      target: 1,
      finished: false,
      dartsThrown: 0,
      reachedAtDarts: 0,
      dartsToFinish: null,
      bullType: null,
      out: false,
      suddenDeathOutRound: null,
    })),
    status: 'in_progress',
    phase: 'normal',
    round: 1,
    current: 0,
    dartInVisit: 1,
    suddenDeathRound: 0,
    suddenDeathHits: [],
    winnerId: null,
    ranking: [],
    dartCount: 0,
  }
}

/** Who throws next and at what, or null when the game is over. */
export function rtwNextDart(s: RtwState): RtwNextDart | null {
  if (s.status === 'finished') return null
  const p = s.players[s.current]
  return {
    playerId: p.playerId,
    round: s.round,
    dartInVisit: s.dartInVisit,
    phase: s.phase,
    target: s.phase === 'sudden_death' ? BULL : p.target,
    seq: s.dartCount + 1,
  }
}

/** Builds the full record to store for a throw, from the current state. */
export function rtwDartRecord(s: RtwState, t: RtwThrow): RtwDartRecord {
  const next = rtwNextDart(s)
  if (!next) throw new Error('The game is over')
  const multiplier = rtwMultiplier(t)
  const bullType: BullType = t.kind === 'outer' || t.kind === 'inner' ? t.kind : null
  return { ...next, segment: multiplier === 0 ? null : next.target, multiplier, bullType }
}

/** Applies one dart and returns the new state. */
export function applyRtwDart(prev: RtwState, t: RtwThrow): RtwState {
  if (prev.status === 'finished') throw new Error('The game is over')
  const s: RtwState = structuredClone(prev)
  s.dartCount++
  return s.phase === 'sudden_death' ? applySuddenDeathDart(s, t) : applyMainDart(s, t)
}

function applyMainDart(s: RtwState, t: RtwThrow): RtwState {
  const p = s.players[s.current]
  const r = rtwAdvance(p.target, t)
  p.dartsThrown++
  if (r.target !== p.target) {
    p.target = r.target
    p.reachedAtDarts = p.dartsThrown
  }
  if (r.finished) {
    p.finished = true
    p.dartsToFinish = p.dartsThrown
    p.bullType = r.bullType
    // Anyone still to throw this round is now in the redemption part.
    s.phase = 'redemption'
  }
  // A visit is 3 darts, or ends early when the player finishes.
  if (r.finished || s.dartInVisit === 3) return endMainVisit(s)
  s.dartInVisit++
  return s
}

function endMainVisit(s: RtwState): RtwState {
  s.dartInVisit = 1
  if (s.current < s.players.length - 1) {
    s.current++
    return s
  }
  // Round complete: everyone has had the same number of visits.
  const finishers = s.players.filter((p) => p.finished)
  if (finishers.length === 0) {
    s.round++
    s.current = 0
    return s
  }
  for (const p of s.players) if (!p.finished) p.out = true
  if (finishers.length === 1) return finishGame(s, finishers[0].playerId)
  // Two or more finished in the same round: sudden death at Bull.
  s.phase = 'sudden_death'
  s.suddenDeathRound = 1
  s.suddenDeathHits = []
  s.round++
  s.current = s.players.findIndex((p) => !p.out)
  return s
}

function applySuddenDeathDart(s: RtwState, t: RtwThrow): RtwState {
  if (t.kind !== 'miss' && t.kind !== 'outer' && t.kind !== 'inner') {
    throw new Error('In sudden death every dart is at Bull: outer, inner or miss')
  }
  const p = s.players[s.current]
  // Inner and outer are equal here. Hitting more than once changes nothing,
  // but all three darts are still thrown and stored.
  if (t.kind !== 'miss' && !s.suddenDeathHits.includes(p.playerId)) s.suddenDeathHits.push(p.playerId)
  if (s.dartInVisit < 3) {
    s.dartInVisit++
    return s
  }
  s.dartInVisit = 1
  const nextIdx = s.players.findIndex((q, i) => i > s.current && !q.out)
  if (nextIdx !== -1) {
    s.current = nextIdx
    return s
  }
  // Sudden-death round complete.
  const alive = s.players.filter((q) => !q.out)
  const hitters = alive.filter((q) => s.suddenDeathHits.includes(q.playerId))
  if (hitters.length === 1) {
    for (const q of alive) if (q !== hitters[0]) markSuddenDeathOut(s, q)
    return finishGame(s, hitters[0].playerId)
  }
  if (hitters.length > 1 && hitters.length < alive.length) {
    // Some hit, some missed: the ones who missed are out, the rest go again.
    for (const q of alive) if (!s.suddenDeathHits.includes(q.playerId)) markSuddenDeathOut(s, q)
  }
  // Everyone hit or everyone missed: replay with the same players.
  s.suddenDeathRound++
  s.suddenDeathHits = []
  s.round++
  s.current = s.players.findIndex((q) => !q.out)
  return s
}

function markSuddenDeathOut(s: RtwState, p: RtwPlayerState) {
  p.out = true
  p.suddenDeathOutRound = s.suddenDeathRound
}

function finishGame(s: RtwState, winnerId: string): RtwState {
  s.status = 'finished'
  s.winnerId = winnerId
  s.ranking = rankRtw(s.players, winnerId)
  return s
}

/**
 * Places for everyone (SPEC.md section 5, rule 9):
 * winner; then sudden-death losers (later knock-out ranks higher);
 * then non-finishers by how far they got, then by fewer darts to get there.
 * Equal players share a place, and the next place is skipped (1, 2, 2, 4).
 */
export function rankRtw(players: RtwPlayerState[], winnerId: string): Placing[] {
  const sortKey = (p: RtwPlayerState): number[] => {
    if (p.playerId === winnerId) return [0]
    if (p.finished) return [1, -(p.suddenDeathOutRound ?? 0)]
    // Bull counts as 21 so it sorts above 20.
    const progress = p.target === BULL ? 21 : p.target
    return [2, -progress, p.reachedAtDarts]
  }
  return assignPlaces(players.map((p) => ({ id: p.playerId, key: sortKey(p) })))
}

/** Rebuilds a game's state from its darts, in order. */
export function replayRtw(playerIds: string[], throws: RtwThrow[]): RtwState {
  return throws.reduce(applyRtwDart, createRtwGame(playerIds))
}
