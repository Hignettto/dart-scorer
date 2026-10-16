// Top level: decides which screen is showing.

import { useState } from 'react'
import { db } from './data/db'
import { startRtwGame } from './data/games'
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
  | { name: 'setup'; order?: string[] }
  | { name: 'game'; gameId: string }

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' })
  const home = () => setScreen({ name: 'home' })

  switch (screen.name) {
    case 'home':
      return (
        <HomeScreen
          onNewGame={() => setScreen({ name: 'setup' })}
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
          initialOrder={screen.order}
          onBack={home}
          onStart={async (order) => setScreen({ name: 'game', gameId: await startRtwGame(db, order) })}
        />
      )
    case 'game':
      return (
        <RtwGameScreen
          key={screen.gameId}
          gameId={screen.gameId}
          onHome={home}
          onRematch={(order) => setScreen({ name: 'setup', order })}
        />
      )
  }
}
