// Manage saved players: add, rename, archive and restore.

import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, type Player } from '../data/db'
import { createPlayer, renamePlayer, setArchived, sortPlayers } from '../data/players'
import { Header } from './ui'

export function PlayersScreen({ onBack }: { onBack: () => void }) {
  const players = useLiveQuery(() => db.players.toArray(), []) ?? []
  const [showArchived, setShowArchived] = useState(false)
  const active = sortPlayers(players.filter((p) => !p.archived))
  const archived = sortPlayers(players.filter((p) => p.archived))

  return (
    <div className="screen">
      <Header title="Players" onBack={onBack} />
      <AddPlayerForm />
      <ul className="list">
        {active.map((p) => (
          <PlayerRow key={p.id} player={p} />
        ))}
        {active.length === 0 && <li className="empty">No players yet. Add one above.</li>}
      </ul>
      {archived.length > 0 && (
        <>
          <button className="link" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? 'Hide' : 'Show'} archived players ({archived.length})
          </button>
          {showArchived && (
            <ul className="list">
              {archived.map((p) => (
                <PlayerRow key={p.id} player={p} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

/** A text box and "Add" button. Calls onAdded with the new player. */
export function AddPlayerForm({ onAdded }: { onAdded?: (p: Player) => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const p = await createPlayer(db, name)
      setName('')
      setError('')
      onAdded?.(p)
    } catch (err) {
      setError((err as Error).message)
    }
  }
  return (
    <form className="add-form" onSubmit={submit}>
      <div className="row">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New player nickname"
          maxLength={20}
          autoCapitalize="words"
          autoComplete="off"
        />
        <button type="submit" className="primary">
          Add
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

function PlayerRow({ player }: { player: Player }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(player.nickname)
  const [error, setError] = useState('')

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await renamePlayer(db, player.id, name)
      setEditing(false)
      setError('')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (editing) {
    return (
      <li>
        <form className="row" onSubmit={save}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} autoFocus />
          <button type="submit" className="primary">
            Save
          </button>
          <button type="button" onClick={() => (setEditing(false), setName(player.nickname), setError(''))}>
            Cancel
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </li>
    )
  }
  return (
    <li className="row">
      <span className="grow name">{player.nickname}</span>
      {!player.archived && <button onClick={() => setEditing(true)}>Rename</button>}
      <button onClick={() => setArchived(db, player.id, !player.archived)}>
        {player.archived ? 'Restore' : 'Archive'}
      </button>
    </li>
  )
}
