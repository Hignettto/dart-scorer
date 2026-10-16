// The Round the World scoring screen (SPEC.md section 5, "Input screen").
//
// The darts for this game are kept in memory here and written to the database
// one by one, in order. The state on screen is always rebuilt from the darts,
// so what you see is exactly what a reload would show.

import { useEffect, useMemo, useRef, useState } from 'react'
import { db, GUEST_ID, type Dart, type Player } from '../data/db'
import { abandonGame, loadGame, makeRtwDart, rtwStateFromDarts, saveRtwDart, undoLastDart, type LoadedGame } from '../data/games'
import type { RtwThrow, RtwThrowKind } from '../engine/rtw'
import { BULL } from '../engine/types'

const targetLabel = (t: number) => (t === BULL ? 'Bull' : String(t))

export function RtwGameScreen({
  gameId,
  onHome,
  onRematch,
}: {
  gameId: string
  onHome: () => void
  onRematch: (order: string[]) => void
}) {
  const [loaded, setLoaded] = useState<LoadedGame>()
  const [players, setPlayers] = useState<Player[]>([])
  const [darts, setDarts] = useState<Dart[]>([])
  /** The seq of the dart after which the "Next player" prompt was dismissed. */
  const [ackSeq, setAckSeq] = useState(-1)
  const [menuOpen, setMenuOpen] = useState(false)
  // Database writes run one after another, in the order they were made.
  const queue = useRef(Promise.resolve())
  const enqueue = (job: () => Promise<void>) => {
    queue.current = queue.current.then(job).catch((e) => alert(`Could not save: ${e}`))
  }

  useEffect(() => {
    loadGame(db, gameId).then((g) => {
      setLoaded(g)
      setDarts(g?.darts ?? [])
    })
    db.players.toArray().then(setPlayers)
  }, [gameId])

  const order = loaded?.order ?? []
  const state = useMemo(() => (loaded ? rtwStateFromDarts(loaded.order, darts) : undefined), [loaded, darts])
  if (!loaded || !state) return <div className="screen">Loading…</div>

  const nameOf = (id: string) => (id === GUEST_ID ? 'Guest' : (players.find((p) => p.id === id)?.nickname ?? '?'))

  const throwDart = (kind: RtwThrowKind) => {
    const { dart, state: after } = makeRtwDart(gameId, state, { kind } as RtwThrow)
    setDarts([...darts, dart])
    enqueue(() => saveRtwDart(db, dart, after))
  }
  const undo = () => {
    if (darts.length === 0) return
    setDarts(darts.slice(0, -1))
    enqueue(() => undoLastDart(db, gameId))
  }

  // ---- Game over
  if (state.status === 'finished') {
    return (
      <div className="screen game">
        <div className="banner win">🏆 {nameOf(state.winnerId!)} wins!</div>
        <ol className="list results">
          {state.ranking.map((r) => {
            const p = state.players.find((q) => q.playerId === r.playerId)!
            return (
              <li key={r.playerId} className="row">
                <span className="pos">{r.place}</span>
                <span className="grow name">{nameOf(r.playerId)}</span>
                <span className="detail">
                  {p.dartsToFinish != null
                    ? `${p.dartsToFinish} darts${p.bullType ? ` · ${p.bullType} bull` : ''}`
                    : `on ${targetLabel(p.target)}`}
                </span>
              </li>
            )
          })}
        </ol>
        <button className="primary big" onClick={() => onRematch(order)}>
          Rematch
        </button>
        <button className="big" onClick={onHome}>
          Home
        </button>
        <button className="link" onClick={undo}>
          ↶ Undo last dart (reopens the game)
        </button>
      </div>
    )
  }

  const current = state.players[state.current]
  const sudden = state.phase === 'sudden_death'
  const target = sudden ? BULL : current.target
  const onBull = target === BULL
  const lastDart = darts[darts.length - 1]
  const showNextPrompt = lastDart && lastDart.seq !== ackSeq && lastDart.playerId !== current.playerId

  return (
    <div className="screen game">
      <div className="row">
        <button className="small" onClick={() => setMenuOpen(true)}>
          ☰
        </button>
        <span className="grow round">
          {sudden ? `Sudden death ${state.suddenDeathRound}` : `Round ${state.round}`}
        </span>
        <button className="small undo" onClick={undo} disabled={darts.length === 0}>
          ↶ Undo
        </button>
      </div>

      {state.phase === 'redemption' && <div className="banner redemption">Redemption round</div>}
      {sudden && <div className="banner sudden">Sudden death – any bull survives</div>}

      <div className="now">
        <div className="who">{nameOf(current.playerId)}</div>
        <div className="target">{targetLabel(target)}</div>
        <div className="darts-left" aria-label={`${4 - state.dartInVisit} darts left`}>
          {[1, 2, 3].map((n) => (
            <span key={n} className={n >= state.dartInVisit ? 'dot on' : 'dot'} />
          ))}
        </div>
      </div>

      <div className="pad">
        {onBull ? (
          <>
            <button className="hit" onClick={() => throwDart('outer')}>
              Outer Bull
            </button>
            <button className="hit inner" onClick={() => throwDart('inner')}>
              Inner Bull
            </button>
          </>
        ) : (
          <>
            <button className="hit" onClick={() => throwDart('single')}>
              Single
            </button>
            <button className="hit" onClick={() => throwDart('double')}>
              Double
            </button>
            <button className="hit" onClick={() => throwDart('treble')}>
              Treble
            </button>
          </>
        )}
        <button className="miss" onClick={() => throwDart('miss')}>
          Miss
        </button>
      </div>

      <ul className="board">
        {state.players.map((p, i) => (
          <li key={p.playerId} className={[i === state.current ? 'current' : '', p.out ? 'out' : ''].join(' ')}>
            <span className="grow name">{nameOf(p.playerId)}</span>
            <span className="t">{p.finished ? '✓' : targetLabel(p.target)}</span>
          </li>
        ))}
      </ul>

      {showNextPrompt && (
        <div className="overlay" onClick={() => setAckSeq(lastDart.seq)}>
          <div className="sheet">
            <p className="muted">{sudden ? 'Sudden death' : state.phase === 'redemption' ? 'Redemption round' : 'Pass the phone'}</p>
            <p className="next">
              Next player:
              <br />
              <strong>{nameOf(current.playerId)}</strong>
            </p>
            <p className="muted">Going for {targetLabel(target)}</p>
            <button className="primary big">Ready</button>
            <button
              className="link"
              onClick={(e) => {
                e.stopPropagation()
                undo()
              }}
            >
              ↶ Undo last dart
            </button>
          </div>
        </div>
      )}

      {menuOpen && (
        <div className="overlay" onClick={() => setMenuOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <button className="big" onClick={onHome}>
              Home (keep game)
            </button>
            <button
              className="big danger"
              onClick={() => {
                if (confirm('Abandon this game? It will be kept in history as abandoned.')) {
                  enqueue(() => abandonGame(db, gameId))
                  queue.current.then(onHome)
                }
              }}
            >
              Abandon game
            </button>
            <button className="big" onClick={() => setMenuOpen(false)}>
              Back to game
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
