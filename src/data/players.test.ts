import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { DartsDB } from './db'
import { cleanNickname, createPlayer, renamePlayer, setArchived } from './players'

let db: DartsDB
beforeEach(async () => {
  db = new DartsDB(`test-${Math.random()}`)
  await db.open()
})

describe('players', () => {
  it('creates a player with a cleaned-up nickname', async () => {
    const p = await createPlayer(db, '  Big   Al ')
    expect(p.nickname).toBe('Big Al')
    expect(p.archived).toBe(false)
    expect(await db.players.count()).toBe(1)
  })

  it('nicknames are unique, ignoring capitals', async () => {
    await createPlayer(db, 'Sam')
    await expect(createPlayer(db, 'sam')).rejects.toThrow('already exists')
  })

  it('archived players still reserve their nickname', async () => {
    const p = await createPlayer(db, 'Sam')
    await setArchived(db, p.id, true)
    await expect(createPlayer(db, 'Sam')).rejects.toThrow('archived')
  })

  it('rejects empty names and "Guest"', async () => {
    await expect(createPlayer(db, '   ')).rejects.toThrow()
    await expect(createPlayer(db, 'guest')).rejects.toThrow()
  })

  it('renames, allowing a change of capitals on the same player', async () => {
    const a = await createPlayer(db, 'sam')
    await renamePlayer(db, a.id, 'Sam')
    expect((await db.players.get(a.id))?.nickname).toBe('Sam')
    const b = await createPlayer(db, 'Jo')
    await expect(renamePlayer(db, b.id, 'SAM')).rejects.toThrow()
  })

  it('archive and restore keep the same player', async () => {
    const p = await createPlayer(db, 'Sam')
    await setArchived(db, p.id, true)
    expect((await db.players.get(p.id))?.archived).toBe(true)
    await setArchived(db, p.id, false)
    expect((await db.players.get(p.id))?.archived).toBe(false)
  })

  it('cleanNickname trims and collapses spaces', () => {
    expect(cleanNickname(' a  b ')).toBe('a b')
  })
})
