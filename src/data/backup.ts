// Backup (JSON) and analysis exports (CSV). SPEC.md section 9 and "Export formats".

import { applyRtwDart, createRtwGame, rtwThrowFromRecord } from '../engine/rtw'
import { BULL } from '../engine/types'
import type { X01Settings } from '../engine/x01'
import { x01Details } from '../stats/x01Stats'
import { GUEST_ID, type Dart, type DartsDB, type Game, type GamePlayer, type Player } from './db'

export const APP_NAME = 'darts-scorer'
export const EXPORT_VERSION = 1

export interface AllData {
  players: Player[]
  games: Game[]
  gamePlayers: GamePlayer[]
  darts: Dart[]
}

export interface Backup extends AllData {
  app: string
  exportVersion: number
  exportedAt: string
}

// ---------------------------------------------------------------------------
// JSON backup

export async function readAll(db: DartsDB): Promise<AllData> {
  const [players, games, gamePlayers, darts] = await Promise.all([
    db.players.toArray(),
    db.games.toArray(),
    db.gamePlayers.toArray(),
    db.darts.toArray(),
  ])
  return { players, games, gamePlayers, darts }
}

export function makeBackup(data: AllData, now = new Date()): Backup {
  return { app: APP_NAME, exportVersion: EXPORT_VERSION, exportedAt: now.toISOString(), ...data }
}

export const backupFileName = (now = new Date()) => `darts-backup-${localDate(now.getTime())}.json`

export class ImportError extends Error {}

/**
 * Checks a backup file and upgrades older formats to the current one.
 * Each future format change adds a step here, so old backups always import.
 */
export function parseBackup(text: string): Backup {
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(text)
  } catch {
    throw new ImportError('This file is not a valid backup (it is not JSON).')
  }
  if (!raw || raw.app !== APP_NAME) throw new ImportError('This file is not a Darts Scorer backup.')
  const version = raw.exportVersion
  if (typeof version !== 'number' || version < 1) throw new ImportError('This backup has no valid version number.')
  if (version > EXPORT_VERSION) {
    throw new ImportError('This backup was made by a newer version of the app. Update the app and try again.')
  }
  // Migrations go here, e.g. `if (version < 2) raw = migrateV1toV2(raw)`.
  for (const key of ['players', 'games', 'gamePlayers', 'darts'] as const) {
    if (!Array.isArray(raw[key])) throw new ImportError(`This backup is missing its ${key} list.`)
  }
  return raw as unknown as Backup
}

/** Replaces everything on this phone with the backup's contents. */
export async function restoreBackup(db: DartsDB, b: Backup): Promise<void> {
  await db.transaction('rw', [db.players, db.games, db.gamePlayers, db.darts], async () => {
    await Promise.all([db.players.clear(), db.games.clear(), db.gamePlayers.clear(), db.darts.clear()])
    await db.players.bulkAdd(b.players)
    await db.games.bulkAdd(b.games)
    await db.gamePlayers.bulkAdd(b.gamePlayers)
    await db.darts.bulkAdd(b.darts)
  })
}

export async function markBackedUp(db: DartsDB, at = Date.now()) {
  await db.meta.put({ key: 'lastBackupAt', value: at })
}

export async function lastBackupAt(db: DartsDB): Promise<number | null> {
  return ((await db.meta.get('lastBackupAt'))?.value as number | undefined) ?? null
}

/** "today", "yesterday", "5 days ago" or "never". */
export function backupAgeText(at: number | null, now = Date.now()): string {
  if (at == null) return 'never'
  const days = Math.floor((startOfDay(now) - startOfDay(at)) / 86_400_000)
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
}

/** A backup more than a week old (or none at all) gets a warning on the home screen. */
export const backupIsOld = (at: number | null, now = Date.now()) => at == null || now - at > 7 * 86_400_000

const startOfDay = (t: number) => new Date(t).setHours(0, 0, 0, 0)

// ---------------------------------------------------------------------------
// CSV exports

type Cell = string | number | boolean | null | undefined

export function toCsv(header: string[], rows: Cell[][]): string {
  const cell = (v: Cell) => {
    if (v == null) return ''
    const s = typeof v === 'boolean' ? (v ? '1' : '0') : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\n') + '\n'
}

/** YYYY-MM-DD in the phone's own time zone. */
function localDate(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface CsvFiles {
  'games.csv': string
  'rtw_darts.csv': string
  'x01_darts.csv': string
}

/**
 * The three analysis files. Only finished games are included, so every row
 * has a result. Derived columns are worked out by replaying each game.
 */
export function makeCsvExports(data: AllData): CsvFiles {
  const nick = (id: string) => (id === GUEST_ID ? 'Guest' : (data.players.find((p) => p.id === id)?.nickname ?? ''))
  const games = data.games.filter((g) => g.status === 'finished').sort((a, b) => a.startedAt - b.startedAt)

  const gameRows: Cell[][] = []
  const rtwRows: Cell[][] = []
  const x01Rows: Cell[][] = []

  for (const g of games) {
    const gps = data.gamePlayers.filter((gp) => gp.gameId === g.id).sort((a, b) => a.throwOrder - b.throwOrder)
    const order = gps.map((gp) => gp.playerId)
    const throwOrder = (id: string) => gps.find((gp) => gp.playerId === id)?.throwOrder
    const darts = data.darts.filter((d) => d.gameId === g.id).sort((a, b) => a.seq - b.seq)
    const date = localDate(g.startedAt)

    if (g.mode === 'x01') {
      const { details, state } = x01Details(order, g.settings as unknown as X01Settings, darts)
      for (const x of details) {
        const d = x.dart
        x01Rows.push([
          g.id, date, d.playerId, nick(d.playerId), throwOrder(d.playerId), d.leg, d.round, d.phase,
          d.visitTotal != null ? 'visit' : d.dartInVisit, d.segment, d.multiplier, d.bullType,
          x.points, x.scoreBefore, x.scoreAfter, x.visitBust ? 1 : 0, x.checkout ? 1 : 0,
        ])
      }
      for (const p of state.players) {
        const gp = gps.find((x) => x.playerId === p.playerId)!
        const result = p.playerId === g.winnerId ? 'won' : p.suddenDeathOutLeg != null ? 'sudden_death_lost' : 'lost'
        gameRows.push([
          g.id, date, g.mode, JSON.stringify(g.settings), p.playerId, nick(p.playerId), gp.throwOrder,
          gp.finishPosition, p.finished ? 1 : 0, p.finished ? p.mainLegDarts : null, result,
        ])
      }
      continue
    }

    let s = createRtwGame(order)
    for (const d of darts) {
      const before = s.players.find((p) => p.playerId === d.playerId)!
      s = applyRtwDart(s, rtwThrowFromRecord({ multiplier: d.multiplier, bullType: d.bullType, target: d.target ?? 0 }))
      const after = s.players.find((p) => p.playerId === d.playerId)!
      const sudden = d.phase === 'sudden_death'
      rtwRows.push([
        g.id, date, d.playerId, nick(d.playerId), throwOrder(d.playerId), d.round, d.phase, d.dartInVisit,
        d.target, d.multiplier, d.bullType, d.multiplier > 0 ? 1 : 0,
        sudden ? BULL : before.target, sudden ? BULL : after.target,
        !sudden && !before.finished && after.finished ? 1 : 0,
      ])
    }

    for (const p of s.players) {
      const gp = gps.find((x) => x.playerId === p.playerId)!
      const result = p.playerId === g.winnerId ? 'won' : p.suddenDeathOutRound != null ? 'sudden_death_lost' : 'lost'
      gameRows.push([
        g.id, date, g.mode, JSON.stringify(g.settings), p.playerId, nick(p.playerId), gp.throwOrder,
        gp.finishPosition, p.finished ? 1 : 0, p.dartsToFinish, result,
      ])
    }
  }

  return {
    'games.csv': toCsv(
      ['game_id', 'date', 'mode', 'settings', 'player_id', 'player', 'throw_order', 'finish_position', 'finished', 'darts_to_finish', 'result'],
      gameRows,
    ),
    'rtw_darts.csv': toCsv(
      ['game_id', 'date', 'player_id', 'player', 'throw_order', 'round', 'phase', 'visit_dart', 'target', 'multiplier', 'bull_type', 'hit', 'position_before', 'position_after', 'finished'],
      rtwRows,
    ),
    'x01_darts.csv': toCsv(
      ['game_id', 'date', 'player_id', 'player', 'throw_order', 'leg', 'round', 'phase', 'visit_dart', 'segment', 'multiplier', 'bull_type', 'points', 'score_before', 'score_after', 'visit_bust', 'checkout'],
      x01Rows,
    ),
  }
}
