// Saving and loading games. Only darts are stored as the game goes on;
// the game state is rebuilt by replaying them (see engine/rtw.ts).

import { applyRtwDart, createRtwGame, replayRtw, rtwDartRecord, rtwThrowFromRecord, type RtwState, type RtwThrow } from '../engine/rtw'
import { newId, type Dart, type DartsDB, type Game, type GamePlayer } from './db'

export interface LoadedGame {
  game: Game
  /** Player ids in throwing order. */
  order: string[]
  darts: Dart[]
}

export async function startRtwGame(db: DartsDB, playerIds: string[]): Promise<string> {
  createRtwGame(playerIds) // checks the player list is valid
  const game: Game = {
    id: newId(),
    mode: 'rtw',
    settings: {},
    startedAt: Date.now(),
    endedAt: null,
    status: 'in_progress',
    winnerId: null,
  }
  const gamePlayers: GamePlayer[] = playerIds.map((playerId, i) => ({
    gameId: game.id,
    playerId,
    throwOrder: i + 1,
    finishPosition: null,
    finished: false,
  }))
  await db.transaction('rw', db.games, db.gamePlayers, async () => {
    await db.games.add(game)
    await db.gamePlayers.bulkAdd(gamePlayers)
  })
  return game.id
}

export async function loadGame(db: DartsDB, gameId: string): Promise<LoadedGame | undefined> {
  const game = await db.games.get(gameId)
  if (!game) return undefined
  const gps = await db.gamePlayers.where('gameId').equals(gameId).toArray()
  const darts = await db.darts.where('[gameId+seq]').between([gameId, -Infinity], [gameId, Infinity]).toArray()
  return { game, order: gps.sort((a, b) => a.throwOrder - b.throwOrder).map((g) => g.playerId), darts }
}

export function rtwStateFromDarts(order: string[], darts: Dart[]): RtwState {
  return replayRtw(
    order,
    darts.map((d) => rtwThrowFromRecord({ multiplier: d.multiplier, bullType: d.bullType, target: d.target ?? 0 })),
  )
}

/**
 * Works out the dart to store for a throw, and the state after it.
 * Pure: nothing is saved until `saveRtwDart` is called.
 */
export function makeRtwDart(gameId: string, state: RtwState, t: RtwThrow): { dart: Dart; state: RtwState } {
  const rec = rtwDartRecord(state, t)
  const dart: Dart = { id: newId(), gameId, leg: 1, timestamp: Date.now(), ...rec }
  return { dart, state: applyRtwDart(state, t) }
}

/** Saves one dart, and the result if that dart ended the game. */
export async function saveRtwDart(db: DartsDB, dart: Dart, after: RtwState): Promise<void> {
  await db.transaction('rw', db.darts, db.games, db.gamePlayers, async () => {
    await db.darts.add(dart)
    if (after.status === 'finished') await saveResult(db, dart.gameId, after)
  })
}

async function saveResult(db: DartsDB, gameId: string, s: RtwState) {
  await db.games.update(gameId, { status: 'finished', endedAt: Date.now(), winnerId: s.winnerId })
  for (const p of s.players) {
    const place = s.ranking.find((r) => r.playerId === p.playerId)?.place ?? null
    await db.gamePlayers.update([gameId, p.playerId], { finishPosition: place, finished: p.finished })
  }
}

/** Removes the last dart. If that reopens a finished game, the result is cleared. */
export async function undoLastDart(db: DartsDB, gameId: string): Promise<void> {
  await db.transaction('rw', db.darts, db.games, db.gamePlayers, async () => {
    const last = await db.darts.where('[gameId+seq]').between([gameId, -Infinity], [gameId, Infinity]).last()
    if (!last) return
    await db.darts.delete(last.id)
    const game = await db.games.get(gameId)
    if (game?.status === 'finished') {
      await db.games.update(gameId, { status: 'in_progress', endedAt: null, winnerId: null })
      await db.gamePlayers.where('gameId').equals(gameId).modify({ finishPosition: null, finished: false })
    }
  })
}

export async function abandonGame(db: DartsDB, gameId: string): Promise<void> {
  await db.games.update(gameId, { status: 'abandoned', endedAt: Date.now() })
}

export async function inProgressGames(db: DartsDB): Promise<Game[]> {
  const games = await db.games.where('status').equals('in_progress').toArray()
  return games.sort((a, b) => b.startedAt - a.startedAt)
}
