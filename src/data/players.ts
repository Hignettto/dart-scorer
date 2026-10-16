// Creating, renaming and archiving players (SPEC.md section 4).

import { GUEST_ID, newId, type DartsDB, type Player } from './db'

export class NicknameError extends Error {}

/** Trims spaces and collapses double spaces, so "  Big  Al " becomes "Big Al". */
export function cleanNickname(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

async function checkNickname(db: DartsDB, nickname: string, exceptId?: string) {
  if (!nickname) throw new NicknameError('Please enter a nickname')
  if (nickname.length > 20) throw new NicknameError('Keep nicknames to 20 characters or fewer')
  if (nickname.toLowerCase() === GUEST_ID) throw new NicknameError('"Guest" is reserved')
  // Unique, ignoring capitals, and including archived players.
  const all = await db.players.toArray()
  const clash = all.find((p) => p.id !== exceptId && p.nickname.toLowerCase() === nickname.toLowerCase())
  if (clash) {
    throw new NicknameError(
      clash.archived ? `"${clash.nickname}" is an archived player. Restore them instead.` : `"${clash.nickname}" already exists`,
    )
  }
}

export async function createPlayer(db: DartsDB, rawNickname: string): Promise<Player> {
  const nickname = cleanNickname(rawNickname)
  await checkNickname(db, nickname)
  const player: Player = { id: newId(), nickname, createdAt: Date.now(), archived: false }
  await db.players.add(player)
  return player
}

export async function renamePlayer(db: DartsDB, id: string, rawNickname: string): Promise<void> {
  const nickname = cleanNickname(rawNickname)
  await checkNickname(db, nickname, id)
  await db.players.update(id, { nickname })
}

/** Archiving hides a player from lists but keeps all their history. */
export async function setArchived(db: DartsDB, id: string, archived: boolean): Promise<void> {
  await db.players.update(id, { archived })
}

/** Players sorted A–Z, ignoring capitals. */
export function sortPlayers(players: Player[]): Player[] {
  return [...players].sort((a, b) => a.nickname.localeCompare(b.nickname, undefined, { sensitivity: 'base' }))
}
