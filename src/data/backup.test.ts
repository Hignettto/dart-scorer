import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { RtwThrow } from '../engine/rtw'
import { backupAgeText, ImportError, makeBackup, makeCsvExports, parseBackup, readAll, restoreBackup, toCsv } from './backup'
import { DartsDB } from './db'
import { loadGame, makeRtwDart, rtwStateFromDarts, saveRtwDart, startRtwGame } from './games'
import { createPlayer } from './players'

let db: DartsDB
beforeEach(async () => {
  db = new DartsDB(`test-${Math.random()}`)
  await db.open()
})

async function throwDarts(gameId: string, throws: RtwThrow[]) {
  for (const t of throws) {
    const g = (await loadGame(db, gameId))!
    const { dart, state } = makeRtwDart(gameId, rtwStateFromDarts(g.order, g.darts), t)
    await saveRtwDart(db, dart, state)
  }
}
const S: RtwThrow = { kind: 'single' }
const M: RtwThrow = { kind: 'miss' }
const O: RtwThrow = { kind: 'outer' }

/** A finished 1-player game: 20 singles then an outer bull. */
async function soloGame() {
  const p = await createPlayer(db, 'Sam, "the Dart"')
  const id = await startRtwGame(db, [p.id])
  await throwDarts(id, [...Array(20).fill(S), O])
  return { p, id }
}

describe('JSON backup', () => {
  it('round-trips everything through export and import', async () => {
    await soloGame()
    const before = await readAll(db)
    const text = JSON.stringify(makeBackup(before))
    const db2 = new DartsDB(`test-${Math.random()}`)
    await restoreBackup(db2, parseBackup(text))
    const after = await readAll(db2)
    expect(after.players).toEqual(before.players)
    expect(after.games).toEqual(before.games)
    expect(after.darts.length).toBe(21)
  })

  it('has the fields the spec asks for', () => {
    const b = makeBackup({ players: [], games: [], gamePlayers: [], darts: [] })
    expect(Object.keys(b)).toEqual(['app', 'exportVersion', 'exportedAt', 'players', 'games', 'gamePlayers', 'darts'])
    expect(b.exportVersion).toBe(1)
  })

  it('rejects files that are not backups, or from a newer app', () => {
    expect(() => parseBackup('nope')).toThrow(ImportError)
    expect(() => parseBackup('{"app":"other"}')).toThrow(ImportError)
    expect(() => parseBackup(JSON.stringify({ ...makeBackup({ players: [], games: [], gamePlayers: [], darts: [] }), exportVersion: 99 }))).toThrow('newer')
  })

  it('restoring replaces existing data', async () => {
    await createPlayer(db, 'Old')
    await restoreBackup(db, makeBackup({ players: [], games: [], gamePlayers: [], darts: [] }))
    expect(await db.players.count()).toBe(0)
  })
})

describe('backup age', () => {
  const day = 86_400_000
  const now = new Date(2026, 9, 16, 12).getTime()
  it.each([
    [null, 'never'],
    [now - 1000, 'today'],
    [now - day, 'yesterday'],
    [now - 5 * day, '5 days ago'],
  ])('%s -> %s', (at, text) => expect(backupAgeText(at, now)).toBe(text))
})

describe('CSV exports', () => {
  it('quotes commas and quotes', () => {
    expect(toCsv(['a', 'b'], [['x,y', 'say "hi"']])).toBe('a,b\n"x,y","say ""hi"""\n')
  })

  it('games.csv has one row per player per finished game', async () => {
    const { p } = await soloGame()
    const csv = makeCsvExports(await readAll(db))['games.csv'].trim().split('\n')
    expect(csv[0]).toBe('game_id,date,mode,settings,player_id,player,throw_order,finish_position,finished,darts_to_finish,result')
    expect(csv).toHaveLength(2)
    expect(csv[1]).toContain(`,rtw,{},${p.id},"Sam, ""the Dart""",1,1,1,21,won`)
  })

  it('rtw_darts.csv works out hit and positions by replaying', async () => {
    await soloGame()
    const rows = makeCsvExports(await readAll(db))['rtw_darts.csv'].trim().split('\n')
    expect(rows).toHaveLength(22)
    const cols = (i: number) => rows[i].split(',').slice(-7)
    // target, multiplier, bull_type, hit, position_before, position_after, finished
    expect(cols(1)).toEqual(['1', '1', '', '1', '1', '2', '0'])
    expect(cols(20)).toEqual(['20', '1', '', '1', '20', '25', '0'])
    expect(cols(21)).toEqual(['25', '1', 'outer', '1', '25', '25', '1'])
  })

  it('marks sudden-death losers', async () => {
    const a = await createPlayer(db, 'A')
    const b = await createPlayer(db, 'B')
    const id = await startRtwGame(db, [a.id, b.id])
    // 6 rounds of 3 singles each puts both on 19; then both finish in round 7.
    await throwDarts(id, Array(36).fill(S))
    await throwDarts(id, [S, S, O, S, S, O])
    // Sudden death: A hits, B misses all three.
    await throwDarts(id, [O, M, M, M, M, M])
    expect((await loadGame(db, id))!.game.winnerId).toBe(a.id)
    const rows = makeCsvExports(await readAll(db))['games.csv']
    expect(rows).toContain(`${b.id},B,2,2,1,21,sudden_death_lost`)
    expect(rows).toContain(`${a.id},A,1,1,1,21,won`)
  })
})
