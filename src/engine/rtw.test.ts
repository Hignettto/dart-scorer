import { describe, expect, it } from 'vitest'
import {
  applyRtwDart,
  createRtwGame,
  replayRtw,
  rtwAdvance,
  rtwDartRecord,
  rtwThrowFromRecord,
  type RtwState,
  type RtwThrow,
  type RtwThrowKind,
} from './rtw'
import { BULL } from './types'

const T = (kind: RtwThrowKind): RtwThrow => ({ kind }) as RtwThrow
const S = T('single'), D = T('double'), TR = T('treble'), M = T('miss'), O = T('outer'), I = T('inner')

/** Applies throws one after another and returns the final state. */
const play = (s: RtwState, ...throws: RtwThrow[]) => throws.reduce(applyRtwDart, s)

/** Puts players straight onto given targets (to keep tests short). */
function gameAt(targets: Record<string, number>): RtwState {
  const s = createRtwGame(Object.keys(targets))
  for (const p of s.players) p.target = targets[p.playerId]
  return s
}

const placeOf = (s: RtwState, id: string) => s.ranking.find((r) => r.playerId === id)?.place

describe('single-dart rules (SPEC section 5 table)', () => {
  const cases: [number, RtwThrow, number, boolean][] = [
    [3, D, 5, false],
    [3, TR, 6, false],
    [18, S, 19, false],
    [18, D, 20, false],
    [18, TR, 20, false],
    [19, TR, 20, false],
    [20, S, BULL, false],
    [20, TR, BULL, false],
    [BULL, O, BULL, true],
    [BULL, I, BULL, true],
  ]
  it.each(cases)('on %s, %o -> on %s, finished %s', (from, t, to, finished) => {
    const r = rtwAdvance(from, t)
    expect(r.target).toBe(to)
    expect(r.finished).toBe(finished)
  })

  it('records bull type on finish', () => {
    expect(rtwAdvance(BULL, O).bullType).toBe('outer')
    expect(rtwAdvance(BULL, I).bullType).toBe('inner')
  })

  it.each([1, 7, 20, BULL])('miss on %s changes nothing but the dart still counts', (from) => {
    expect(rtwAdvance(from, M)).toEqual({ target: from, finished: false, bullType: null })
    const s = play(gameAt({ a: from }), M)
    expect(s.players[0].target).toBe(from)
    expect(s.players[0].dartsThrown).toBe(1)
    expect(s.dartInVisit).toBe(2)
  })

  it('rejects bull buttons when not on Bull, and S/D/T when on Bull', () => {
    expect(() => rtwAdvance(5, O)).toThrow()
    expect(() => rtwAdvance(BULL, D)).toThrow()
  })
})

describe('visits', () => {
  it('every visit is 3 darts, then the next player throws', () => {
    let s = createRtwGame(['p1', 'p2'])
    s = play(s, M, M)
    expect(s.current).toBe(0)
    s = play(s, M)
    expect(s.current).toBe(1)
    expect(s.dartInVisit).toBe(1)
  })

  it('a new round starts after the last player', () => {
    const s = play(createRtwGame(['p1', 'p2']), M, M, M, M, M, M)
    expect(s.round).toBe(2)
    expect(s.current).toBe(0)
  })

  it('finishing on dart 1 or 2 ends the visit early', () => {
    const s = play(gameAt({ p1: BULL, p2: 1, p3: 1 }), M, I)
    expect(s.current).toBe(1)
    expect(s.dartInVisit).toBe(1)
    expect(s.players[0].dartsThrown).toBe(2)
  })
})

describe('game flow, 3 players P1 P2 P3', () => {
  it('P1 finishes, P2 and P3 do not -> P1 wins after redemption', () => {
    let s = play(gameAt({ p1: BULL, p2: 10, p3: 10 }), O)
    expect(s.status).toBe('in_progress')
    expect(s.phase).toBe('redemption')
    s = play(s, M, M, M) // P2 redemption visit
    expect(s.status).toBe('in_progress')
    s = play(s, M, M, M) // P3 redemption visit
    expect(s.status).toBe('finished')
    expect(s.winnerId).toBe('p1')
  })

  it('P3 finishes before anyone else -> game ends at once, P3 wins', () => {
    const s = play(gameAt({ p1: 10, p2: 10, p3: BULL }), M, M, M, M, M, M, I)
    expect(s.status).toBe('finished')
    expect(s.winnerId).toBe('p3')
  })

  it('redemption darts are labelled as redemption', () => {
    let s = play(gameAt({ p1: BULL, p2: 10, p3: 10 }), O)
    expect(rtwDartRecord(s, M).phase).toBe('redemption')
    s = createRtwGame(['p1'])
    expect(rtwDartRecord(s, M).phase).toBe('normal')
  })

  /** P1 finishes, P2 misses, P3 finishes -> sudden death between P1 and P3. */
  const toSuddenDeath = () => play(gameAt({ p1: BULL, p2: BULL, p3: BULL }), O, M, M, M, I)

  it('P1 finishes, P2 misses, P3 finishes -> P2 out, P1 and P3 to sudden death', () => {
    const s = toSuddenDeath()
    expect(s.status).toBe('in_progress')
    expect(s.phase).toBe('sudden_death')
    expect(s.players.map((p) => p.out)).toEqual([false, true, false])
    expect(s.players[s.current].playerId).toBe('p1')
    expect(rtwDartRecord(s, M).target).toBe(BULL)
  })

  it('sudden death: P1 hits Bull, P3 misses -> P1 wins', () => {
    const s = play(toSuddenDeath(), O, M, M, M, M, M)
    expect(s.status).toBe('finished')
    expect(s.winnerId).toBe('p1')
  })

  it('sudden death: P1 hits on dart 3, P3 hits on dart 1 -> both survive, repeat', () => {
    const s = play(toSuddenDeath(), M, M, O, I, M, M)
    expect(s.status).toBe('in_progress')
    expect(s.suddenDeathRound).toBe(2)
    expect(s.players[s.current].playerId).toBe('p1')
  })

  it('sudden death: both hit -> repeat; both miss -> repeat', () => {
    let s = play(toSuddenDeath(), I, M, M, O, M, M)
    expect(s.status).toBe('in_progress')
    expect(s.suddenDeathRound).toBe(2)
    s = play(s, M, M, M, M, M, M)
    expect(s.status).toBe('in_progress')
    expect(s.suddenDeathRound).toBe(3)
    expect(s.players.filter((p) => !p.out).map((p) => p.playerId)).toEqual(['p1', 'p3'])
  })

  it('sudden death: P3 hits Bull with dart 1 -> still throws darts 2 and 3', () => {
    let s = play(toSuddenDeath(), M, M, M, I)
    expect(s.status).toBe('in_progress')
    expect(s.players[s.current].playerId).toBe('p3')
    expect(s.dartInVisit).toBe(2)
    s = play(s, M)
    expect(s.dartInVisit).toBe(3)
    const before = s.dartCount
    s = play(s, M)
    expect(s.dartCount).toBe(before + 1)
    expect(s.winnerId).toBe('p3')
  })

  it('sudden death darts do not count towards darts to finish', () => {
    const s = play(toSuddenDeath(), O, M, M, M, M, M)
    expect(s.players[0].dartsToFinish).toBe(1)
    expect(s.players[0].dartsThrown).toBe(1)
  })

  it('ranking: P1 wins sudden death vs P3, P2 did not finish -> P1, P3, P2', () => {
    const s = play(toSuddenDeath(), O, M, M, M, M, M)
    expect(placeOf(s, 'p1')).toBe(1)
    expect(placeOf(s, 'p3')).toBe(2)
    expect(placeOf(s, 'p2')).toBe(3)
  })
})

describe('ranking', () => {
  it('4 players: P2 finishes alone, P1 on 18, P3 on 18 in fewer darts, P4 on 12', () => {
    // Round 1: P1 needs 3 visits worth of darts... build it up dart by dart instead.
    let s = gameAt({ p1: 16, p2: BULL, p3: 17, p4: 12 })
    // P1: miss, miss, double -> 18 on their 3rd dart.
    // P2: inner bull -> finished.
    // P3: single -> 18 on their 1st dart (fewer darts than P1).
    // P4: miss x3 -> stays on 12.
    s = play(s, M, M, D, I, S, M, M, M, M, M)
    expect(s.status).toBe('finished')
    expect(s.players.map((p) => p.target)).toEqual([18, BULL, 18, 12])
    expect(s.ranking).toEqual([
      { playerId: 'p2', place: 1 },
      { playerId: 'p3', place: 2 },
      { playerId: 'p1', place: 3 },
      { playerId: 'p4', place: 4 },
    ])
  })

  it('non-finishers on the same target in the same number of darts share a place', () => {
    const s = play(gameAt({ a: BULL, b: 5, c: 5 }), O, M, M, M, M, M, M)
    expect(placeOf(s, 'a')).toBe(1)
    expect(placeOf(s, 'b')).toBe(2)
    expect(placeOf(s, 'c')).toBe(2)
  })

  it('Bull ranks above 20 for non-finishers', () => {
    const s = play(gameAt({ a: BULL, b: 20, c: BULL }), O, M, M, M, M, M, M)
    expect(placeOf(s, 'c')).toBe(2)
    expect(placeOf(s, 'b')).toBe(3)
  })

  it('3-way sudden death: later knock-out ranks higher, same round shares', () => {
    let s = gameAt({ a: BULL, b: BULL, c: BULL, d: BULL })
    s = play(s, O, O, O, M, M, M) // a, b, c finish; d misses
    expect(s.phase).toBe('sudden_death')
    s = play(s, O, M, M, O, M, M, M, M, M) // SD1: a & b hit, c out
    expect(s.status).toBe('in_progress')
    s = play(s, I, M, M, M, M, M) // SD2: a hits, b out
    expect(s.winnerId).toBe('a')
    expect(s.ranking).toEqual([
      { playerId: 'a', place: 1 },
      { playerId: 'b', place: 2 },
      { playerId: 'c', place: 3 },
      { playerId: 'd', place: 4 },
    ])
  })

  it('players knocked out in the same sudden-death round share a place', () => {
    let s = play(gameAt({ a: BULL, b: BULL, c: BULL }), O, O, O)
    s = play(s, O, M, M, M, M, M, M, M, M)
    expect(s.ranking).toEqual([
      { playerId: 'a', place: 1 },
      { playerId: 'b', place: 2 },
      { playerId: 'c', place: 2 },
    ])
  })
})

describe('replay and undo', () => {
  it('a full game from the start replays to the same state', () => {
    // One player, 20 singles to reach Bull, then outer bull.
    const throws: RtwThrow[] = [...Array(20).fill(S), O]
    const s = replayRtw(['solo'], throws)
    expect(s.status).toBe('finished')
    expect(s.winnerId).toBe('solo')
    expect(s.players[0].dartsToFinish).toBe(21)
  })

  it('undo = replay all but the last dart, across player changes', () => {
    const throws: RtwThrow[] = [S, D, TR, S]
    const full = replayRtw(['p1', 'p2'], throws)
    expect(full.current).toBe(1)
    const undone = replayRtw(['p1', 'p2'], throws.slice(0, -1))
    expect(undone.current).toBe(1)
    expect(undone.dartInVisit).toBe(1)
    const undone2 = replayRtw(['p1', 'p2'], throws.slice(0, -2))
    expect(undone2.current).toBe(0)
    expect(undone2.dartInVisit).toBe(3)
    expect(undone2.players[0].target).toBe(4)
  })

  it('stored records convert back to the same throws', () => {
    let s = gameAt({ a: 20, b: BULL })
    const throws = [TR, M, M, I]
    for (const t of throws) {
      const rec = rtwDartRecord(s, t)
      expect(rtwThrowFromRecord(rec)).toEqual(t)
      s = applyRtwDart(s, t)
    }
  })

  it('applying a dart does not change the previous state', () => {
    const s = createRtwGame(['a'])
    applyRtwDart(s, TR)
    expect(s.players[0].target).toBe(1)
  })

  it('no darts can be thrown after the game ends', () => {
    const s = play(gameAt({ a: BULL }), O)
    expect(() => applyRtwDart(s, M)).toThrow()
  })
})
