// Top level: decides which screen is showing.

import { useState } from 'react'
import { HomeScreen } from './screens/HomeScreen'
import { PlayersScreen } from './screens/PlayersScreen'
import { SetupScreen } from './screens/SetupScreen'

type Screen = { name: 'home' } | { name: 'players' } | { name: 'setup'; order?: string[] }

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' })
  const home = () => setScreen({ name: 'home' })

  switch (screen.name) {
    case 'home':
      return <HomeScreen onNewGame={() => setScreen({ name: 'setup' })} onPlayers={() => setScreen({ name: 'players' })} />
    case 'players':
      return <PlayersScreen onBack={home} />
    case 'setup':
      return <SetupScreen initialOrder={screen.order} onBack={home} onStart={() => home()} />
  }
}
