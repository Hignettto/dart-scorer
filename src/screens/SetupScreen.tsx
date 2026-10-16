// Game setup: choose players (1-8) in throwing order.

import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, GUEST_ID, type GameMode } from '../data/db'
import { DEFAULT_X01_SETTINGS, type X01Settings } from '../engine/x01'
import { sortPlayers } from '../data/players'
import { AddPlayerForm } from './PlayersScreen'
import { Header } from './ui'

export const MAX_PLAYERS = 8

export function SetupScreen({
  mode,
  initialOrder = [],
  initialSettings = DEFAULT_X01_SETTINGS,
  onBack,
  onStart,
}: {
  mode: GameMode
  initialOrder?: string[]
  initialSettings?: X01Settings
  onBack: () => void
  onStart: (playerIds: string[], settings: X01Settings) => void
}) {
  const players = useLiveQuery(() => db.players.toArray(), []) ?? []
  const [order, setOrder] = useState<string[]>(initialOrder)
  const [settings, setSettings] = useState<X01Settings>(initialSettings)
  const set = (patch: Partial<X01Settings>) => setSettings({ ...settings, ...patch })
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
      <Header title={mode === 'rtw' ? 'Round the World' : 'X01'} onBack={onBack} />

      {mode === 'x01' && (
        <div className="settings">
          <Toggle label="Start" value={settings.start} options={[[301, '301'], [501, '501']]} onChange={(start) => set({ start })} />
          <Toggle label="Double in" value={settings.doubleIn} options={[[false, 'Off'], [true, 'On']]} onChange={(doubleIn) => set({ doubleIn })} />
          <Toggle label="Double out" value={settings.doubleOut} options={[[false, 'Off'], [true, 'On']]} onChange={(doubleOut) => set({ doubleOut })} />
          <Toggle
            label="Enter"
            value={settings.inputMode}
            options={[['dart', 'Each dart'], ['visit', 'Visit total']]}
            onChange={(inputMode) => set({ inputMode })}
          />
        </div>
      )}

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

      <button className="primary big" disabled={order.length === 0} onClick={() => onStart(order, settings)}>
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

function Toggle<T extends string | number | boolean>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: [T, string][]
  onChange: (v: T) => void
}) {
  return (
    <div className="row toggle">
      <span className="grow">{label}</span>
      <div className="seg">
        {options.map(([v, text]) => (
          <button key={String(v)} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}
