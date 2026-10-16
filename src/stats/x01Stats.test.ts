import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeCsvExports, readAll } from '../data/backup'
import { DartsDB } from '../data/db'
import { loadGame, makeX01Dart, saveX01Dart, startX01Game, x01StateFromDarts } from '../data/games'
import { createPlayer } from '../data/players'
import type { Multiplier } from '../engine/types'
import type { X01Input, X01Settings } from '../engine/x01'
import { x01Stats } from './x01Stats'

let db: DartsDB
beforeEach(async () => {
  db = new DartsDB(`test-${Math.random()}`)
  await db.open()
})

const d = (segment: number | null, multiplier: Multiplier): X01Input => ({ kind: 'dart', segment, multiplier })
const T = (n: number) => d(n, 3)
const S = (n: number) => d(n, 1)
const MISS = d(null, 0)
const V = (total: number, dartsUsed = 3, dartsAtDouble = 0): X01Input => ({ kind: 'visit', total, dartsUsed, dartsAtDouble })
const SET: X01Settings = { start: 301, doubleIn: false, doubleOut: true, inputMode: 'dart' }

async function play(ids: string[], settings: X01Settings, inputs: X01Input[]) {
  const id = await startX01Game(db, ids, settings)
  const g = (await loadGame(db, id))!
  let state = x01StateFromDarts(g.order, settings, [])
  for (const i of inputs) {
    const r = makeX01Dart(id, state, i)
    await saveX01Dart(db, r.dart, r.state)
    state = r.state
  }
  return id
}

describe('X01 stats', () => {
  it('3-dart average, first 9, 180s and checkout', async () => {
    const a = await createPlayer(db, 'A')
    // Visit 1: T20 T20 T20 = 180 -> 121
    // Visit 2: T20 S11 -> 50, then MISS at Bull = 50 still (dart at double: 50 is a finishing double)
    // Visit 3: D25 (inner bull) -> checkout 50
    await play([a.id], SET, [T(20), T(20), T(20), T(20), S(11), MISS, d(25, 2)])
    const s = x01Stats(await readAll(db), a.id)
    expect(s.played).toBe(1)
    expect(s.wins).toBe(1)
    expect(s.max180s).toBe(1)
    expect(s.threeDartAvg).toBeCloseTo((301 / 7) * 3)
    expect(s.first9Avg).toBeCloseTo((301 / 7) * 3)
    expect(s.highestCheckout).toBe(50)
    expect(s.dartsAtDouble).toBe(2) // the miss on 50 and the bull
    expect(s.checkoutPct).toBe(0.5)
  })

  it('a bust visit scores 0 but its darts count', async () => {
    const a = await createPlayer(db, 'A')
    // 180 (121 left); T20 T20 leaves 1 -> bust (2 darts, 0 scored); T20 S11 inner bull.
    await play([a.id], SET, [T(20), T(20), T(20), T(20), T(20), T(20), S(11), d(25, 2)])
    const s = x01Stats(await readAll(db), a.id)
    expect(s.threeDartAvg).toBeCloseTo((301 / 8) * 3)
    expect(s.first9Avg).toBeCloseTo((301 / 8) * 3)
  })

  it('per-visit entry: averages use darts used on the checkout visit', async () => {
    const a = await createPlayer(db, 'A')
    await play([a.id], { ...SET, inputMode: 'visit' }, [V(140), V(121, 3, 0), V(40, 1, 1)])
    const s = x01Stats(await readAll(db), a.id)
    expect(s.threeDartAvg).toBeCloseTo((301 / 7) * 3)
    expect(s.ton40s).toBe(1)
    expect(s.tons).toBe(1)
    expect(s.checkoutPct).toBe(1)
    expect(s.highestCheckout).toBe(40)
  })
})

describe('x01_darts.csv', () => {
  it('has points, scores before/after, bust flags and checkout', async () => {
    const a = await createPlayer(db, 'A')
    // 301: T20 T20 T20 (121); T20 T20 would leave 1 -> bust, back to 121; then T20 S11 inner bull.
    await play([a.id], SET, [T(20), T(20), T(20), T(20), T(20), T(20), S(11), d(25, 2)])
    const csv = makeCsvExports(await readAll(db))
    const rows = csv['x01_darts.csv'].trim().split('\n').map((r) => r.split(',').slice(-6))
    // points, score_before, score_after, visit_bust, checkout (plus bull_type before)
    expect(rows[0]).toEqual(['bull_type', 'points', 'score_before', 'score_after', 'visit_bust', 'checkout'])
    expect(rows[4].slice(1)).toEqual(['60', '121', '61', '1', '0'])
    expect(rows[5].slice(1)).toEqual(['60', '61', '121', '1', '0']) // busting dart goes back to visit start
    expect(rows[8]).toEqual(['inner', '50', '50', '0', '0', '1'])
    expect(csv['games.csv']).toContain(',x01,')
    expect(csv['games.csv']).toContain(',1,1,1,8,won')
  })
})
