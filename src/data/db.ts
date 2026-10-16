// The on-phone database (IndexedDB, via the Dexie library).
// Table shapes follow SPEC.md section 3. Stats are never stored here:
// they are always worked out from the darts.

import Dexie, { type EntityTable } from 'dexie'
import type { BullType, Multiplier, Phase } from '../engine/types'

export interface Player {
  id: string
  nickname: string
  createdAt: number
  archived: boolean
}

export type GameMode = 'rtw' | 'x01'
export type GameStatus = 'in_progress' | 'finished' | 'abandoned'

export interface Game {
  id: string
  mode: GameMode
  settings: Record<string, unknown>
  startedAt: number
  endedAt: number | null
  status: GameStatus
  winnerId: string | null
}

export interface GamePlayer {
  gameId: string
  playerId: string
  throwOrder: number // 1 = throws first
  finishPosition: number | null
  finished: boolean
}

export interface Dart {
  id: string
  gameId: string
  playerId: string
  seq: number
  leg: number
  round: number
  dartInVisit: number
  phase: Phase
  target: number | null
  segment: number | null
  multiplier: Multiplier
  bullType: BullType
  timestamp: number
}

/** Small key/value settings, e.g. when the last backup was made. */
export interface Meta {
  key: string
  value: unknown
}

/** The guest's id. The guest is never saved as a player, so has no stats. */
export const GUEST_ID = 'guest'

export class DartsDB extends Dexie {
  players!: EntityTable<Player, 'id'>
  games!: EntityTable<Game, 'id'>
  gamePlayers!: Dexie.Table<GamePlayer, [string, string]>
  darts!: EntityTable<Dart, 'id'>
  meta!: EntityTable<Meta, 'key'>

  constructor(name = 'darts') {
    super(name)
    this.version(1).stores({
      players: 'id, nickname, archived',
      games: 'id, status, startedAt',
      gamePlayers: '[gameId+playerId], gameId, playerId',
      darts: 'id, gameId, [gameId+seq], playerId',
      meta: 'key',
    })
  }
}

export const db = new DartsDB()

export const newId = () => crypto.randomUUID()
