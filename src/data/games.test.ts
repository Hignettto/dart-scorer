import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { RtwThrow } from '../engine/rtw'
import { DartsDB } from './db'
import { abandonGame, inProgressGames, loadGame, makeRtwDart, rtwStateFromDarts, saveRtwDart, startRtwGame, undoLastDart } from './games'

let db: DartsDB
beforeEach(async () => {
  db = new DartsDB(`test-${Math.random()}`)
  await db.open()
})

const S: RtwThrow = { kind: 'single' }
const M: RtwThrow = { kind: 'miss' }
const O: RtwThrow = { kind: 'outer' }

/** Throws darts in a stored game the way the game screen does. */
async function throwDarts(gameId: string, throws: RtwThrow[]) {
  for (const t of throws) {
    const g = (await loadGame(db, gameId))!
    const { dart, state } = makeRtwDart(gameId, rtwStateFromDarts(g.order, g.darts), t)
    await saveRtwDart(db, dart, state)
  }
}

describe('stored games', () => {
  it('saves players in throwing order', async () => {
    const id = await startRtwGame(db, ['b', 'a', 'c'])
    const g = await loadGame(db, id)
    expect(g?.order).toEqual(['b', 'a', 'c'])
    expect(g?.game.status).toBe('in_progress')
  })

  it('stores every dart with its context, and rebuilds the state after reloading', async () => {
    const id = await startRtwGame(db, ['a', 'b'])
    await throwDarts(id, [S, M, S, S])
    const g = (await loadGame(db, id))!
    expect(g.darts.map((d) => [d.playerId, d.seq, d.round, d.dartInVisit, d.target, d.segment, d.multiplier])).toEqual([
      ['a', 1, 1, 1, 1, 1, 1],
      ['a', 2, 1, 2, 2, null, 0],
      ['a', 3, 1, 3, 2, 2, 1],
      ['b', 4, 1, 1, 1, 1, 1],
    ])
    const s = rtwStateFromDarts(g.order, g.darts)
    expect(s.players.map((p) => p.target)).toEqual([3, 2])
  })

  it('a finished game saves the winner and places; undo reopens it', async () => {
    const id = await startRtwGame(db, ['solo'])
    await throwDarts(id, [...Array(20).fill(S), O])
    let g = (await loadGame(db, id))!
    expect(g.game.status).toBe('finished')
    expect(g.game.winnerId).toBe('solo')
    expect((await db.gamePlayers.get([id, 'solo']))?.finishPosition).toBe(1)

    await undoLastDart(db, id)
    g = (await loadGame(db, id))!
    expect(g.game.status).toBe('in_progress')
    expect(g.game.winnerId).toBeNull()
    expect(g.darts).toHaveLength(20)
    expect((await db.gamePlayers.get([id, 'solo']))?.finishPosition).toBeNull()
  })

  it('undo removes only the last dart', async () => {
    const id = await startRtwGame(db, ['a', 'b'])
    await throwDarts(id, [S, S, S, S])
    await undoLastDart(db, id)
    const g = (await loadGame(db, id))!
    expect(g.darts.map((d) => d.seq)).toEqual([1, 2, 3])
  })

  it('lists in-progress games and drops abandoned ones', async () => {
    const id = await startRtwGame(db, ['a'])
    expect((await inProgressGames(db)).map((g) => g.id)).toEqual([id])
    await abandonGame(db, id)
    expect(await inProgressGames(db)).toEqual([])
  })
})
