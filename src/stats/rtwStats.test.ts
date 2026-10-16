import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { RtwThrow } from '../engine/rtw'
import { readAll } from '../data/backup'
import { DartsDB } from '../data/db'
import { abandonGame, loadGame, makeRtwDart, rtwStateFromDarts, saveRtwDart, startRtwGame } from '../data/games'
import { createPlayer } from '../data/players'
import { rankTargets, rtwStats } from './rtwStats'

let db: DartsDB
beforeEach(async () => {
  db = new DartsDB(`test-${Math.random()}`)
  await db.open()
})

const S: RtwThrow = { kind: 'single' }
const D: RtwThrow = { kind: 'double' }
const T: RtwThrow = { kind: 'treble' }
const M: RtwThrow = { kind: 'miss' }
const O: RtwThrow = { kind: 'outer' }
const I: RtwThrow = { kind: 'inner' }

async function play(ids: string[], throws: RtwThrow[]) {
  const id = await startRtwGame(db, ids)
  for (const t of throws) {
    const g = (await loadGame(db, id))!
    const { dart, state } = makeRtwDart(id, rtwStateFromDarts(g.order, g.darts), t)
    await saveRtwDart(db, dart, state)
  }
  return id
}

describe('Round the World stats', () => {
  it('counts games, wins, darts to finish, and bull type', async () => {
    const a = await createPlayer(db, 'A')
    await play([a.id], [...Array(20).fill(S), O]) // 21 darts
    await play([a.id], [M, ...Array(20).fill(S), I]) // 22 darts
    const s = rtwStats(await readAll(db), a.id)
    expect(s.played).toBe(2)
    expect(s.wins).toBe(2)
    expect(s.winPct).toBe(1)
    expect(s.finishedGames).toBe(2)
    expect(s.avgDartsToFinish).toBe(21.5)
    expect(s.bestDartsToFinish).toBe(21)
    expect([s.innerBullFinishes, s.outerBullFinishes]).toEqual([1, 1])
  })

  it('hit rate per target counts misses as attempts', async () => {
    const a = await createPlayer(db, 'A')
    await play([a.id], [M, M, S, ...Array(19).fill(S), O])
    const s = rtwStats(await readAll(db), a.id)
    expect(s.targets[0]).toEqual({ target: 1, attempts: 3, hits: 1, rate: 1 / 3 })
    expect(s.targets[20]).toEqual({ target: 25, attempts: 1, hits: 1, rate: 1 })
    expect(rankTargets(s.targets)[20].target).toBe(1) // hardest
  })

  it('counts doubles and trebles as a share of darts at numbers', async () => {
    const a = await createPlayer(db, 'A')
    // 1 -> D -> 3 -> T -> 6 -> then singles to 20 (14), single to Bull, outer.
    await play([a.id], [D, T, ...Array(14).fill(S), S, O])
    const s = rtwStats(await readAll(db), a.id)
    expect(s.doubles).toBe(1)
    expect(s.trebles).toBe(1)
    expect(s.numberDarts).toBe(17)
  })

  it('ignores abandoned games and other players', async () => {
    const a = await createPlayer(db, 'A')
    const b = await createPlayer(db, 'B')
    const id = await play([a.id, b.id], [S, S, S])
    await abandonGame(db, id)
    const s = rtwStats(await readAll(db), a.id)
    expect(s.played).toBe(0)
    expect(s.targets.every((t) => t.attempts === 0)).toBe(true)
    expect(s.winPct).toBeNull()
  })

  it('sudden-death record and head-to-head', async () => {
    const a = await createPlayer(db, 'A')
    const b = await createPlayer(db, 'B')
    const c = await createPlayer(db, 'C')
    // A and B go 1 -> 19 in 6 visits of singles; C misses everything.
    const rounds: RtwThrow[] = []
    for (let r = 0; r < 6; r++) rounds.push(S, S, S, S, S, S, M, M, M)
    // Round 7: A and B both finish, C misses. Then sudden death: A hits, B misses.
    await play([a.id, b.id, c.id], [...rounds, S, S, O, S, S, O, M, M, M, O, M, M, M, M, M])
    const data = await readAll(db)
    const sa = rtwStats(data, a.id)
    const sb = rtwStats(data, b.id)
    const sc = rtwStats(data, c.id)
    expect([sa.suddenDeathPlayed, sa.suddenDeathWon]).toEqual([1, 1])
    expect([sb.suddenDeathPlayed, sb.suddenDeathWon]).toEqual([1, 0])
    expect(sc.suddenDeathPlayed).toBe(0)
    expect(sa.finishedGames).toBe(1)
    expect(sa.avgDartsToFinish).toBe(21) // sudden-death darts not counted
    expect(sb.headToHead.find((h) => h.opponentId === a.id)).toMatchObject({ games: 1, wins: 0, losses: 1 })
    expect(sb.headToHead.find((h) => h.opponentId === c.id)).toMatchObject({ games: 1, wins: 1, losses: 0 })
  })
})
