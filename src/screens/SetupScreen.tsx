// Game setup: choose players (1-8) in throwing order.

import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, GUEST_ID } from '../data/db'
import { sortPlayers } from '../data/players'
import { AddPlayerForm } from './PlayersScreen'
import { Header } from './ui'

export const MAX_PLAYERS = 8

export function SetupScreen({
  initialOrder = [],
  onBack,
  onStart,
}: {
  initialOrder?: string[]
  onBack: () => void
  onStart: (playerIds: string[]) => void
}) {
  const players = useLiveQuery(() => db.players.toArray(), []) ?? []
  const [order, setOrder] = useState<string[]>(initialOrder)
  const nameOf = (id: string) => (id === GUEST_ID ? 'Guest' : (players.find((p) => p.id === id)?.nickname ?? '…'))
  const full = order.length >= MAX_PLAYERS

  const add = (id: string) => !full && !order.includes(id) && setOrder([...order, id])
  const remove = (id: string) => setOrder(order.filter((x) => x !== id))
  const move = (i: number, by: -1 | 1) => {
    const next = [...order]
    ;[next[i], next[i + by]] = [next[i + by], next[i]]
    setOrder(next)
  }

  const available = sortPlayers(players.filter((p) => !p.archived && !order.includes(p.id)))

  return (
    <div className="screen">
      <Header title="Round the World" onBack={onBack} />

      <h2>Throwing order</h2>
      {order.length === 0 && <p className="empty">Tap players below to add them, first thrower first.</p>}
      <ol className="list order">
        {order.map((id, i) => (
          <li key={id} className="row">
            <span className="pos">{i + 1}</span>
            <span className="grow name">{nameOf(id)}</span>
            <button className="icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
              ▲
            </button>
            <button className="icon" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
              ▼
            </button>
            <button className="icon" onClick={() => remove(id)} aria-label="Remove">
              ✕
            </button>
          </li>
        ))}
      </ol>

      <button className="primary big" disabled={order.length === 0} onClick={() => onStart(order)}>
        Start game
      </button>

      <h2>Add players {full && <small>(max {MAX_PLAYERS})</small>}</h2>
      <div className="chips">
        {available.map((p) => (
          <button key={p.id} className="chip" disabled={full} onClick={() => add(p.id)}>
            {p.nickname}
          </button>
        ))}
        {!order.includes(GUEST_ID) && (
          <button className="chip guest" disabled={full} onClick={() => add(GUEST_ID)}>
            Guest
          </button>
        )}
      </div>
      <AddPlayerForm onAdded={(p) => add(p.id)} />
    </div>
  )
}
