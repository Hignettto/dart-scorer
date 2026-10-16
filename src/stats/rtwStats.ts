// Round the World stats for one player (SPEC.md section 7).
// Nothing here is stored: it is all worked out from the darts each time.

import type { AllData } from '../data/backup'
import { rtwStateFromDarts } from '../data/games'
import type { RtwState } from '../engine/rtw'
import { BULL } from '../engine/types'

/** Targets with fewer attempts than this are greyed out. */
export const MIN_ATTEMPTS = 20

export interface TargetRate {
  target: number
  attempts: number
  hits: number
  rate: number | null // null when never attempted
}

export interface HeadToHead {
  opponentId: string
  games: number
  wins: number // games where this player finished above the opponent
  losses: number
  draws: number // shared place
}

export interface RtwStats {
  played: number
  wins: number
  winPct: number | null
  finishedGames: number // games where the player reached the end (got a darts-to-finish figure)
  avgDartsToFinish: number | null
  bestDartsToFinish: number | null
  targets: TargetRate[] // 1-20 then Bull
  numberDarts: number // darts thrown at 1-20
  doubles: number
  trebles: number
  innerBullFinishes: number
  outerBullFinishes: number
  suddenDeathPlayed: number
  suddenDeathWon: number
  headToHead: HeadToHead[]
}

/** Replays every finished Round the World game once. */
export function finishedRtwGames(data: AllData): { gameId: string; state: RtwState }[] {
  return data.games
    .filter((g) => g.mode === 'rtw' && g.status === 'finished')
    .map((g) => {
      const order = data.gamePlayers
        .filter((gp) => gp.gameId === g.id)
        .sort((a, b) => a.throwOrder - b.throwOrder)
        .map((gp) => gp.playerId)
      const darts = data.darts.filter((d) => d.gameId === g.id).sort((a, b) => a.seq - b.seq)
      return { gameId: g.id, state: rtwStateFromDarts(order, darts) }
    })
    .filter((x) => x.state.status === 'finished')
}

export function rtwStats(data: AllData, playerId: string, games = finishedRtwGames(data)): RtwStats {
  const mine = games.filter((g) => g.state.players.some((p) => p.playerId === playerId))
  const gameIds = new Set(mine.map((g) => g.gameId))

  let wins = 0
  const finishes: number[] = []
  let inner = 0
  let outer = 0
  let sdPlayed = 0
  let sdWon = 0
  const h2h = new Map<string, HeadToHead>()

  for (const { state } of mine) {
    const me = state.players.find((p) => p.playerId === playerId)!
    const won = state.winnerId === playerId
    if (won) wins++
    if (me.dartsToFinish != null) finishes.push(me.dartsToFinish)
    if (me.bullType === 'inner') inner++
    if (me.bullType === 'outer') outer++
    // Sudden death happened if anyone was knocked out in it; I was in it if I finished.
    const hadSuddenDeath = state.suddenDeathRound > 0
    if (hadSuddenDeath && me.finished) {
      sdPlayed++
      if (won) sdWon++
    }
    const myPlace = state.ranking.find((r) => r.playerId === playerId)!.place
    for (const r of state.ranking) {
      if (r.playerId === playerId) continue
      const h = h2h.get(r.playerId) ?? { opponentId: r.playerId, games: 0, wins: 0, losses: 0, draws: 0 }
      h.games++
      if (myPlace < r.place) h.wins++
      else if (myPlace > r.place) h.losses++
      else h.draws++
      h2h.set(r.playerId, h)
    }
  }

  // Hit rates use every dart this player threw in these games, sudden death included.
  const counts = new Map<number, { attempts: number; hits: number }>()
  let numberDarts = 0
  let doubles = 0
  let trebles = 0
  for (const d of data.darts) {
    if (d.playerId !== playerId || !gameIds.has(d.gameId) || d.target == null) continue
    const c = counts.get(d.target) ?? { attempts: 0, hits: 0 }
    c.attempts++
    if (d.multiplier > 0) c.hits++
    counts.set(d.target, c)
    if (d.target !== BULL) {
      numberDarts++
      if (d.multiplier === 2) doubles++
      if (d.multiplier === 3) trebles++
    }
  }
  const targets = [...Array(20).keys()].map((i) => i + 1).concat(BULL).map((target) => {
    const c = counts.get(target) ?? { attempts: 0, hits: 0 }
    return { target, ...c, rate: c.attempts ? c.hits / c.attempts : null }
  })

  return {
    played: mine.length,
    wins,
    winPct: mine.length ? wins / mine.length : null,
    finishedGames: finishes.length,
    avgDartsToFinish: finishes.length ? finishes.reduce((a, b) => a + b, 0) / finishes.length : null,
    bestDartsToFinish: finishes.length ? Math.min(...finishes) : null,
    targets,
    numberDarts,
    doubles,
    trebles,
    innerBullFinishes: inner,
    outerBullFinishes: outer,
    suddenDeathPlayed: sdPlayed,
    suddenDeathWon: sdWon,
    headToHead: [...h2h.values()].sort((a, b) => b.games - a.games),
  }
}

/** Targets ordered easiest to hardest. Ones never attempted go last. */
export function rankTargets(targets: TargetRate[]): TargetRate[] {
  return [...targets].sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.attempts - a.attempts)
}
