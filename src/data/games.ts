// Saving and loading games. Only darts are stored as the game goes on;
// the game state is rebuilt by replaying them (see engine/rtw.ts).

import { applyRtwDart, createRtwGame, replayRtw, rtwDartRecord, rtwThrowFromRecord, type RtwState, type RtwThrow } from '../engine/rtw'
import type { Placing } from '../engine/types'
import { applyX01, bullTypeOf, createX01Game, replayX01, x01NextDart, type X01Input, type X01Settings, type X01State } from '../engine/x01'
import { newId, type Dart, type DartsDB, type Game, type GameMode, type GamePlayer } from './db'

export interface LoadedGame {
  game: Game
  /** Player ids in throwing order. */
  order: string[]
  darts: Dart[]
}

export const startRtwGame = (db: DartsDB, playerIds: string[]) => startGame(db, 'rtw', playerIds, {})

export const startX01Game = (db: DartsDB, playerIds: string[], settings: X01Settings) =>
  startGame(db, 'x01', playerIds, settings as unknown as Record<string, unknown>)

async function startGame(db: DartsDB, mode: GameMode, playerIds: string[], settings: Record<string, unknown>): Promise<string> {
  // Checks the player list and settings are valid before saving anything.
  if (mode === 'rtw') createRtwGame(playerIds)
  else createX01Game(playerIds, settings as unknown as X01Settings)
  const game: Game = {
    id: newId(),
    mode,
    settings,
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

/** What gets saved when a game ends. */
interface Outcome {
  status: 'in_progress' | 'finished'
  winnerId: string | null
  ranking: Placing[]
  players: { playerId: string; finished: boolean }[]
}

export const saveRtwDart = (db: DartsDB, dart: Dart, after: RtwState) => saveDart(db, dart, after)
export const saveX01Dart = (db: DartsDB, dart: Dart, after: X01State) => saveDart(db, dart, after)

/** Saves one dart, and the result if that dart ended the game. */
async function saveDart(db: DartsDB, dart: Dart, after: Outcome): Promise<void> {
  await db.transaction('rw', db.darts, db.games, db.gamePlayers, async () => {
    await db.darts.add(dart)
    if (after.status === 'finished') await saveResult(db, dart.gameId, after)
  })
}

async function saveResult(db: DartsDB, gameId: string, s: Outcome) {
  await db.games.update(gameId, { status: 'finished', endedAt: Date.now(), winnerId: s.winnerId })
  for (const p of s.players) {
    const place = s.ranking.find((r) => r.playerId === p.playerId)?.place ?? null
    await db.gamePlayers.update([gameId, p.playerId], { finishPosition: place, finished: p.finished })
  }
}

// ---------------------------------------------------------------------------
// X01

/** Turns a stored dart (or stored visit) back into an input for replaying. */
export function x01InputFromDart(d: Dart): X01Input {
  if (d.visitTotal != null) {
    return { kind: 'visit', total: d.visitTotal, dartsUsed: d.dartsUsed ?? 3, dartsAtDouble: d.dartsAtDouble ?? 0 }
  }
  return { kind: 'dart', segment: d.segment, multiplier: d.multiplier }
}

export function x01StateFromDarts(order: string[], settings: X01Settings, darts: Dart[]): X01State {
  return replayX01(order, settings, darts.map(x01InputFromDart))
}

export function makeX01Dart(gameId: string, state: X01State, input: X01Input): { dart: Dart; state: X01State } {
  const after = applyX01(state, input) // throws if the input is not allowed
  const next = x01NextDart(state)!
  const base = { id: newId(), gameId, timestamp: Date.now(), target: null, ...next }
  const dart: Dart =
    input.kind === 'dart'
      ? {
          ...base,
          segment: input.multiplier === 0 ? null : input.segment,
          multiplier: input.multiplier,
          bullType: bullTypeOf(input.segment, input.multiplier),
        }
      : {
          ...base,
          segment: null,
          multiplier: 0,
          bullType: null,
          visitTotal: input.total,
          dartsUsed: input.dartsUsed,
          dartsAtDouble: input.dartsAtDouble,
        }
  return { dart, state: after }
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
