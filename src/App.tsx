// Top level: decides which screen is showing.

import { useState } from 'react'
import { db } from './data/db'
import { useLiveQuery } from 'dexie-react-hooks'
import { startRtwGame, startX01Game } from './data/games'
import type { GameMode } from './data/db'
import type { X01Settings } from './engine/x01'
import { X01GameScreen } from './screens/X01GameScreen'
import { BackupScreen } from './screens/BackupScreen'
import { GameLogScreen, HistoryScreen } from './screens/HistoryScreen'
import { HomeScreen } from './screens/HomeScreen'
import { PlayersScreen } from './screens/PlayersScreen'
import { RtwGameScreen } from './screens/RtwGameScreen'
import { StatsScreen } from './screens/StatsScreen'
import { SetupScreen } from './screens/SetupScreen'

type Screen =
  | { name: 'home' }
  | { name: 'players' }
  | { name: 'backup' }
  | { name: 'history' }
  | { name: 'stats' }
  | { name: 'log'; gameId: string }
  | { name: 'setup'; mode: GameMode; order?: string[]; settings?: X01Settings }
  | { name: 'game'; gameId: string }

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' })
  const home = () => setScreen({ name: 'home' })

  switch (screen.name) {
    case 'home':
      return (
        <HomeScreen
          onNewGame={(mode) => setScreen({ name: 'setup', mode })}
          onPlayers={() => setScreen({ name: 'players' })}
          onResume={(gameId) => setScreen({ name: 'game', gameId })}
          onBackup={() => setScreen({ name: 'backup' })}
          onHistory={() => setScreen({ name: 'history' })}
          onStats={() => setScreen({ name: 'stats' })}
        />
      )
    case 'stats':
      return <StatsScreen onBack={home} />
    case 'history':
      return <HistoryScreen onBack={home} onOpen={(gameId) => setScreen({ name: 'log', gameId })} />
    case 'log':
      return (
        <GameLogScreen
          gameId={screen.gameId}
          onBack={() => setScreen({ name: 'history' })}
          onResume={(gameId) => setScreen({ name: 'game', gameId })}
        />
      )
    case 'backup':
      return <BackupScreen onBack={home} />
    case 'players':
      return <PlayersScreen onBack={home} />
    case 'setup':
      return (
        <SetupScreen
          key={screen.mode}
          mode={screen.mode}
          initialOrder={screen.order}
          initialSettings={screen.settings}
          onBack={home}
          onStart={async (order, settings) =>
            setScreen({
              name: 'game',
              gameId: screen.mode === 'rtw' ? await startRtwGame(db, order) : await startX01Game(db, order, settings),
            })
          }
        />
      )
    case 'game':
      return (
        <GameScreen
          key={screen.gameId}
          gameId={screen.gameId}
          onHome={home}
          onRematch={(mode, order, settings) => setScreen({ name: 'setup', mode, order, settings })}
        />
      )
  }
}

/** Shows the right scoring screen for the game's mode. */
function GameScreen({
  gameId,
  onHome,
  onRematch,
}: {
  gameId: string
  onHome: () => void
  onRematch: (mode: GameMode, order: string[], settings?: X01Settings) => void
}) {
  const game = useLiveQuery(() => db.games.get(gameId), [gameId])
  if (!game) return <div className="screen">Loading…</div>
  return game.mode === 'x01' ? (
    <X01GameScreen gameId={gameId} onHome={onHome} onRematch={(order, settings) => onRematch('x01', order, settings)} />
  ) : (
    <RtwGameScreen gameId={gameId} onHome={onHome} onRematch={(order) => onRematch('rtw', order)} />
  )
}
