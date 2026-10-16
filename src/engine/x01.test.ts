import { describe, expect, it } from 'vitest'
import { BOGEY_NUMBERS, suggestCheckout, throwLabel } from './checkout'
import { applyX01, createX01Game, type X01Input, type X01Settings, type X01State } from './x01'
import type { Multiplier } from './types'

const d = (segment: number | null, multiplier: Multiplier): X01Input => ({ kind: 'dart', segment, multiplier })
const S = (n: number) => d(n, 1)
const D = (n: number) => d(n, 2)
const T = (n: number) => d(n, 3)
const MISS = d(null, 0)
const OUTER = d(25, 1)
const INNER = d(25, 2)
const V = (total: number, dartsUsed = 3, dartsAtDouble = 0): X01Input => ({ kind: 'visit', total, dartsUsed, dartsAtDouble })

const SET: X01Settings = { start: 501, doubleIn: false, doubleOut: true, inputMode: 'dart' }
const play = (s: X01State, ...inputs: X01Input[]) => inputs.reduce(applyX01, s)

/** A game with players already on given scores. */
function gameAt(scores: Record<string, number>, settings: Partial<X01Settings> = {}): X01State {
  const s = createX01Game(Object.keys(scores), { ...SET, ...settings })
  for (const p of s.players) p.score = p.visitStartScore = scores[p.playerId]
  return s
}
const score = (s: X01State, id: string) => s.players.find((p) => p.playerId === id)!.score
const placeOf = (s: X01State, id: string) => s.ranking.find((r) => r.playerId === id)?.place

describe('scoring', () => {
  it('subtracts dart scores: T20 = 60, outer bull 25, inner bull 50', () => {
    let s = createX01Game(['a'], SET)
    s = play(s, T(20), OUTER, INNER)
    expect(score(s, 'a')).toBe(501 - 135)
  })

  it('a miss scores nothing but uses a dart', () => {
    const s = play(createX01Game(['a', 'b'], SET), MISS, MISS, MISS)
    expect(score(s, 'a')).toBe(501)
    expect(s.current).toBe(1)
  })

  it('rejects impossible darts', () => {
    expect(() => play(createX01Game(['a'], SET), d(25, 3))).toThrow()
    expect(() => play(createX01Game(['a'], SET), d(21, 1))).toThrow()
  })
})

describe('double-in', () => {
  const DI = { doubleIn: true }
  it('nothing counts until a double; the double itself counts', () => {
    let s = createX01Game(['a'], { ...SET, ...DI })
    s = play(s, T(20), S(5))
    expect(score(s, 'a')).toBe(501)
    s = play(s, D(10))
    expect(score(s, 'a')).toBe(481)
    s = play(s, S(1)) // next visit, already opened
    expect(score(s, 'a')).toBe(480)
  })
  it('inner bull opens', () => {
    const s = play(createX01Game(['a'], { ...SET, ...DI }), INNER)
    expect(score(s, 'a')).toBe(451)
  })
  it('sudden-death legs have no double-in even if the game does', () => {
    let s = gameAt({ a: 40, b: 40 }, DI)
    for (const p of s.players) p.opened = p.openedAtVisitStart = true
    s = play(s, D(20), D(20))
    expect(s.leg).toBe(2)
    s = play(s, T(20))
    expect(score(s, 'a')).toBe(110)
  })
})

describe('busts', () => {
  it('going below 0 busts: score goes back to the visit start, rest of visit void', () => {
    let s = gameAt({ a: 50, b: 100 })
    s = play(s, S(20), T(20))
    expect(score(s, 'a')).toBe(50)
    expect(s.lastEvent).toBe('bust')
    expect(s.current).toBe(1)
    expect(s.dartInVisit).toBe(1)
  })
  it('double-out: landing on 1 busts', () => {
    const s = play(gameAt({ a: 21, b: 100 }), S(20))
    expect(score(s, 'a')).toBe(21)
    expect(s.lastEvent).toBe('bust')
  })
  it('double-out: reaching 0 on a non-double busts', () => {
    const s = play(gameAt({ a: 20, b: 100 }), S(20))
    expect(score(s, 'a')).toBe(20)
    expect(s.lastEvent).toBe('bust')
  })
  it('double-out: inner bull finishes 50', () => {
    const s = play(gameAt({ a: 50 }), INNER)
    expect(s.status).toBe('finished')
  })
  it('without double-out, any dart can finish and 1 is fine', () => {
    let s = play(gameAt({ a: 21, b: 100 }, { doubleOut: false }), S(20))
    expect(score(s, 'a')).toBe(1)
    s = gameAt({ a: 20 }, { doubleOut: false })
    expect(play(s, S(20)).status).toBe('finished')
  })
  it('a bust after scoring earlier in the visit cancels the whole visit', () => {
    const s = play(gameAt({ a: 100, b: 100 }), T(20), S(20), T(20))
    expect(score(s, 'a')).toBe(100)
  })
  it('a bust that happens in the visit where double-in opened also undoes the opening', () => {
    const s = createX01Game(['a', 'b'], { ...SET, doubleIn: true, start: 301 })
    s.players[0].score = s.players[0].visitStartScore = 30
    const after = play(s, D(20))
    expect(after.players[0].opened).toBe(false)
    expect(score(after, 'a')).toBe(30)
  })
})

describe('game end, redemption and sudden death (3 players)', () => {
  it('first to 0 wins after the others get their redemption visit', () => {
    let s = play(gameAt({ p1: 40, p2: 100, p3: 100 }), D(20))
    expect(s.status).toBe('in_progress')
    expect(s.phase).toBe('redemption')
    s = play(s, MISS, MISS, MISS, MISS, MISS, MISS)
    expect(s.winnerId).toBe('p1')
  })
  it('last in order checking out first ends the game at once', () => {
    const s = play(gameAt({ p1: 100, p2: 100, p3: 40 }), MISS, MISS, MISS, MISS, MISS, MISS, D(20))
    expect(s.status).toBe('finished')
    expect(s.winnerId).toBe('p3')
  })
  it('two checkouts in a round go to a 170 double-out leg; the rest are out', () => {
    const s = play(gameAt({ p1: 40, p2: 100, p3: 32 }), D(20), MISS, MISS, MISS, D(16))
    expect(s.leg).toBe(2)
    expect(s.phase).toBe('sudden_death')
    expect(s.players.map((p) => [p.out, p.score])).toEqual([
      [false, 170],
      [true, 100],
      [false, 170],
    ])
    expect(s.players[s.current].playerId).toBe('p1')
  })
  it('sudden-death leg: first checkout wins unless redeemed; ranking follows', () => {
    let s = play(gameAt({ p1: 40, p2: 100, p3: 32 }), D(20), MISS, MISS, MISS, D(16))
    s = play(s, T(20), T(20), INNER) // p1 checks out 170
    expect(s.status).toBe('in_progress') // p3 gets redemption
    s = play(s, T(20), T(20), MISS)
    expect(s.winnerId).toBe('p1')
    expect([placeOf(s, 'p1'), placeOf(s, 'p3'), placeOf(s, 'p2')]).toEqual([1, 2, 3])
  })
  it('both check out again -> another 170 leg', () => {
    let s = play(gameAt({ p1: 40, p2: 100, p3: 32 }), D(20), MISS, MISS, MISS, D(16))
    s = play(s, T(20), T(20), INNER, T(20), T(20), INNER)
    expect(s.leg).toBe(3)
    expect(s.players.filter((p) => !p.out).map((p) => p.score)).toEqual([170, 170])
  })
  it('non-finishers rank by lowest score left; equal scores share', () => {
    const s = play(gameAt({ a: 40, b: 100, c: 60, d: 100 }), D(20), MISS, MISS, MISS, MISS, MISS, MISS, MISS, MISS, MISS)
    expect(s.ranking).toEqual([
      { playerId: 'a', place: 1 },
      { playerId: 'c', place: 2 },
      { playerId: 'b', place: 3 },
      { playerId: 'd', place: 3 },
    ])
  })
})

describe('per-visit entry', () => {
  it('subtracts the total and moves to the next player', () => {
    const s = play(createX01Game(['a', 'b'], { ...SET, inputMode: 'visit' }), V(140))
    expect(score(s, 'a')).toBe(361)
    expect(s.current).toBe(1)
  })
  it('busts on going below zero or leaving 1', () => {
    expect(play(gameAt({ a: 50, b: 1 }), V(60)).players[0].score).toBe(50)
    expect(play(gameAt({ a: 50, b: 1 }), V(49)).players[0].score).toBe(50)
  })
  it('checks out on exactly 0, counting the darts used', () => {
    const s = play(gameAt({ a: 81 }), V(81, 2, 1))
    expect(s.winnerId).toBe('a')
    expect(s.players[0].mainLegDarts).toBe(2)
  })
  it('rejects totals three darts cannot make', () => {
    expect(() => play(createX01Game(['a'], SET), V(179))).toThrow()
    expect(() => play(createX01Game(['a'], SET), V(181))).toThrow()
  })
})

describe('checkout hints', () => {
  const hint = (score: number, darts = 3) => suggestCheckout(score, darts)?.map(throwLabel).join(' ') ?? null

  it('classic finishes', () => {
    expect(hint(170)).toBe('T20 T20 Bull')
    expect(hint(167)).toBe('T20 T19 Bull')
    expect(hint(160)).toBe('T20 T20 D20')
    expect(hint(100)).toBe('T20 D20')
    expect(hint(40)).toBe('D20')
    expect(hint(50)).toBe('Bull')
    expect(hint(32)).toBe('D16')
  })

  it('the bogey numbers and anything over 170 have no 3-dart finish', () => {
    for (const n of BOGEY_NUMBERS) expect(hint(n)).toBeNull()
    expect(hint(171)).toBeNull()
    expect(hint(1)).toBeNull()
  })

  it('every other score from 2 to 170 has a valid finish ending on a double', () => {
    for (let n = 2; n <= 170; n++) {
      if (BOGEY_NUMBERS.includes(n)) continue
      const r = suggestCheckout(n, 3)!
      expect(r, `no finish for ${n}`).not.toBeNull()
      expect(r.reduce((a, t) => a + t.segment * t.multiplier, 0)).toBe(n)
      expect(r[r.length - 1].multiplier).toBe(2)
    }
  })

  it('respects darts left', () => {
    expect(hint(100, 1)).toBeNull()
    expect(hint(100, 2)).toBe('T20 D20')
    expect(hint(130, 2)).toBeNull()
  })
})
