// Top level: decides which screen is showing.

import { useState } from 'react'
import { db } from './data/db'
import { startRtwGame } from './data/games'
import { HomeScreen } from './screens/HomeScreen'
import { PlayersScreen } from './screens/PlayersScreen'
import { RtwGameScreen } from './screens/RtwGameScreen'
import { SetupScreen } from './screens/SetupScreen'

type Screen =
  | { name: 'home' }
  | { name: 'players' }
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
        />
      )
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
