// Match history: past games, and a dart-by-dart log for each (SPEC.md section 8).

import { useLiveQuery } from 'dexie-react-hooks'
import { db, GUEST_ID, type Game, type Player } from '../data/db'
import { dartLabel, groupVisits } from '../data/history'
import { Header } from './ui'

const MODE_NAMES: Record<string, string> = { rtw: 'Round the World', x01: 'X01' }
const STATUS_NAMES: Record<string, string> = { in_progress: 'In progress', abandoned: 'Abandoned' }

function useNames() {
  const players = useLiveQuery(() => db.players.toArray(), []) ?? []
  return (id: string | null) => (id === GUEST_ID ? 'Guest' : (players.find((p: Player) => p.id === id)?.nickname ?? '?'))
}

const modeName = (g: Game) =>
  g.mode === 'x01' && g.settings.start ? String(g.settings.start) : (MODE_NAMES[g.mode] ?? g.mode)

export function HistoryScreen({ onBack, onOpen }: { onBack: () => void; onOpen: (gameId: string) => void }) {
  const games = useLiveQuery(() => db.games.orderBy('startedAt').reverse().toArray(), [])
  const gps = useLiveQuery(() => db.gamePlayers.toArray(), []) ?? []
  const name = useNames()

  return (
    <div className="screen">
      <Header title="History" onBack={onBack} />
      {games?.length === 0 && <p className="empty">No games yet.</p>}
      <ul className="list history">
        {games?.map((g) => {
          const players = gps
            .filter((x) => x.gameId === g.id)
            .sort((a, b) => a.throwOrder - b.throwOrder)
            .map((x) => name(x.playerId))
          return (
            <li key={g.id}>
              <button className="history-item" onClick={() => onOpen(g.id)}>
                <span className="muted">
                  {new Date(g.startedAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                  {' · '}
                  {modeName(g)}
                </span>
                <span className="players">{players.join(', ')}</span>
                <span className={g.status === 'finished' ? 'winner' : 'muted'}>
                  {g.status === 'finished' ? `🏆 ${name(g.winnerId)}` : STATUS_NAMES[g.status]}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function GameLogScreen({
  gameId,
  onBack,
  onResume,
}: {
  gameId: string
  onBack: () => void
  onResume: (gameId: string) => void
}) {
  const game = useLiveQuery(() => db.games.get(gameId), [gameId])
  const gps = useLiveQuery(() => db.gamePlayers.where('gameId').equals(gameId).toArray(), [gameId]) ?? []
  const darts =
    useLiveQuery(() => db.darts.where('[gameId+seq]').between([gameId, -Infinity], [gameId, Infinity]).toArray(), [gameId]) ?? []
  const name = useNames()
  if (!game) return <div className="screen">Loading…</div>

  const placings = [...gps].sort((a, b) => (a.finishPosition ?? 99) - (b.finishPosition ?? 99) || a.throwOrder - b.throwOrder)
  const visits = groupVisits(darts)

  return (
    <div className="screen">
      <Header title={modeName(game)} onBack={onBack} />
      <p className="muted">
        {new Date(game.startedAt).toLocaleString()} · {darts.length} darts
        {game.status !== 'finished' && ` · ${STATUS_NAMES[game.status]}`}
      </p>
      {game.status === 'in_progress' && (
        <button className="primary big" onClick={() => onResume(game.id)}>
          Resume game
        </button>
      )}

      <ol className="list results">
        {placings.map((p) => (
          <li key={p.playerId} className="row">
            <span className="pos">{p.finishPosition ?? '–'}</span>
            <span className="grow name">{name(p.playerId)}</span>
            <span className="detail">throws {p.throwOrder}</span>
          </li>
        ))}
      </ol>

      <h2>Dart by dart</h2>
      <table className="log">
        <tbody>
          {visits.map((v, i) => {
            const newRound = i === 0 || visits[i - 1].round !== v.round
            return (
              <tr key={v.darts[0].id} className={newRound ? 'new-round' : ''}>
                <td className="r">{newRound ? (v.phase === 'sudden_death' ? 'SD' : `R${v.round}`) : ''}</td>
                <td className="p">{name(v.playerId)}</td>
                <td className="t">{v.darts[0].target === 25 ? 'Bull' : v.darts[0].target}</td>
                <td className="d">
                  {v.darts.map((d) => (
                    <span key={d.id} className={d.multiplier === 0 ? 'miss' : 'hit'}>
                      {dartLabel(d)}
                    </span>
                  ))}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {visits.some((v) => v.phase !== 'normal') && (
        <p className="muted small-print">The first column shows the round number. SD = sudden death. The target column shows what the player was on at the start of the visit.</p>
      )}
    </div>
  )
}
