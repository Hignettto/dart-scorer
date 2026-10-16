import { Header } from './ui'

export function HomeScreen({ onNewGame, onPlayers }: { onNewGame: () => void; onPlayers: () => void }) {
  return (
    <div className="screen">
      <Header title="Darts Scorer" />
      <div className="menu">
        <button className="primary big" onClick={onNewGame}>
          New Round the World
        </button>
        <button className="big" onClick={onPlayers}>
          Players
        </button>
      </div>
    </div>
  )
}
