import { useLiveQuery } from 'dexie-react-hooks'
import { backupAgeText, backupIsOld, lastBackupAt } from '../data/backup'
import { db, GUEST_ID } from '../data/db'
import { abandonGame, inProgressGames } from '../data/games'
import { Header } from './ui'

export function HomeScreen({
  onNewGame,
  onPlayers,
  onResume,
  onBackup,
}: {
  onNewGame: () => void
  onPlayers: () => void
  onResume: (gameId: string) => void
  onBackup: () => void
}) {
  const lastBackup = useLiveQuery(() => lastBackupAt(db), [])
  const backupOld = lastBackup !== undefined && backupIsOld(lastBackup)
  const games = useLiveQuery(() => inProgressGames(db), []) ?? []
  const players = useLiveQuery(() => db.players.toArray(), []) ?? []
  const gps = useLiveQuery(() => db.gamePlayers.toArray(), []) ?? []
  const names = (gameId: string) =>
    gps
      .filter((g) => g.gameId === gameId)
      .sort((a, b) => a.throwOrder - b.throwOrder)
      .map((g) => (g.playerId === GUEST_ID ? 'Guest' : (players.find((p) => p.id === g.playerId)?.nickname ?? '?')))
      .join(', ')

  return (
    <div className="screen">
      <Header title="Darts Scorer" />
      {games.map((g) => (
        <div key={g.id} className="resume">
          <div className="muted">Game in progress · {new Date(g.startedAt).toLocaleString()}</div>
          <div className="name">{names(g.id)}</div>
          <div className="row">
            <button className="primary grow" onClick={() => onResume(g.id)}>
              Resume
            </button>
            <button
              onClick={() => confirm('Abandon this game? It will be kept in history as abandoned.') && abandonGame(db, g.id)}
            >
              Abandon
            </button>
          </div>
        </div>
      ))}
      <div className="menu">
        <button className="primary big" onClick={onNewGame}>
          New Round the World
        </button>
        <button className="big" onClick={onPlayers}>
          Players
        </button>
        <button className="big" onClick={onBackup}>
          Backup
        </button>
      </div>
      {lastBackup !== undefined && (
        <p className={backupOld ? 'backup-age warn' : 'backup-age'}>Last backup: {backupAgeText(lastBackup)}</p>
      )}
    </div>
  )
}
