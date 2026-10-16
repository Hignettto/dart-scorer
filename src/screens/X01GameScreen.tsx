// The X01 scoring screen (SPEC.md section 6, "Input screen").
// Works the same way as the Round the World screen: darts are kept in memory,
// saved one by one, and the state is always rebuilt by replaying them.

import { useEffect, useMemo, useRef, useState } from 'react'
import { db, GUEST_ID, type Dart, type Player } from '../data/db'
import { abandonGame, loadGame, makeX01Dart, saveX01Dart, undoLastDart, x01StateFromDarts, type LoadedGame } from '../data/games'
import { dartLabel } from '../data/history'
import { suggestCheckout, throwLabel } from '../engine/checkout'
import { BULL, type Multiplier } from '../engine/types'
import { IMPOSSIBLE_VISIT_TOTALS, type X01Input, type X01Settings } from '../engine/x01'

export function X01GameScreen({
  gameId,
  onHome,
  onRematch,
}: {
  gameId: string
  onHome: () => void
  onRematch: (order: string[], settings: X01Settings) => void
}) {
  const [loaded, setLoaded] = useState<LoadedGame>()
  const [players, setPlayers] = useState<Player[]>([])
  const [darts, setDarts] = useState<Dart[]>([])
  const [ackSeq, setAckSeq] = useState(-1)
  const [menuOpen, setMenuOpen] = useState(false)
  const [mult, setMult] = useState<Multiplier>(1)
  const [error, setError] = useState('')
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

  const settings = loaded?.game.settings as unknown as X01Settings | undefined
  const state = useMemo(
    () => (loaded && settings ? x01StateFromDarts(loaded.order, settings, darts) : undefined),
    [loaded, settings, darts],
  )
  if (!loaded || !state || !settings) return <div className="screen">Loading…</div>

  const nameOf = (id: string) => (id === GUEST_ID ? 'Guest' : (players.find((p) => p.id === id)?.nickname ?? '?'))

  const enter = (input: X01Input) => {
    try {
      const { dart, state: after } = makeX01Dart(gameId, state, input)
      setDarts([...darts, dart])
      setMult(1)
      setError('')
      enqueue(() => saveX01Dart(db, dart, after))
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const undo = () => {
    if (darts.length === 0) return
    setDarts(darts.slice(0, -1))
    setError('')
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
                <span className="detail">{p.finished ? `checked out · ${p.mainLegDarts} darts` : `${p.mainLegScore} left`}</span>
              </li>
            )
          })}
        </ol>
        <button className="primary big" onClick={() => onRematch(loaded.order, settings)}>
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
  const doubleOut = sudden || settings.doubleOut
  const dartsLeft = 4 - state.dartInVisit
  const hint = doubleOut && current.opened ? suggestCheckout(current.score, dartsLeft) : null
  const lastDart = darts[darts.length - 1]
  const showNextPrompt = lastDart && lastDart.seq !== ackSeq && lastDart.playerId !== current.playerId
  const thisVisit = state.dartInVisit > 1 ? darts.slice(-(state.dartInVisit - 1)) : []
  const lastWasBust = state.lastEvent === 'bust'

  return (
    <div className="screen game x01">
      <div className="row">
        <button className="small" onClick={() => setMenuOpen(true)}>
          ☰
        </button>
        <span className="grow round">
          {sudden ? `Sudden death · leg ${state.leg}` : `${settings.start}`} · Round {state.round}
        </span>
        <button className="small undo" onClick={undo} disabled={darts.length === 0}>
          ↶ Undo
        </button>
      </div>

      {state.phase === 'redemption' && <div className="banner redemption">Redemption round</div>}
      {sudden && <div className="banner sudden">Sudden death · from 170, double out</div>}

      <div className="now">
        <div className="who">{nameOf(current.playerId)}</div>
        <div className="target">{current.score}</div>
        {!current.opened && <div className="muted">Needs a double to start</div>}
        {settings.inputMode === 'dart' && (
        <div className="visit-darts">
          {[0, 1, 2].map((i) => (
            <span key={i} className={thisVisit[i] ? 'chip-dart done' : i === thisVisit.length ? 'chip-dart next' : 'chip-dart'}>
              {thisVisit[i] ? dartLabel(thisVisit[i]) : ''}
            </span>
          ))}
        </div>
        )}
        {hint && <div className="hint">{hint.map(throwLabel).join('  ')}</div>}
      </div>

      {error && <p className="error">{error}</p>}

      {settings.inputMode === 'dart' ? (
        <DartPad mult={mult} setMult={setMult} onDart={(segment, m) => enter({ kind: 'dart', segment, multiplier: m })} />
      ) : (
        <VisitPad
          key={darts.length}
          score={current.score}
          askDouble={doubleOut && current.score <= 170}
          onVisit={(total, dartsUsed, dartsAtDouble) => enter({ kind: 'visit', total, dartsUsed, dartsAtDouble })}
        />
      )}

      <ul className="board">
        {state.players.map((p, i) => (
          <li key={p.playerId} className={[i === state.current ? 'current' : '', p.out ? 'out' : ''].join(' ')}>
            <span className="grow name">{nameOf(p.playerId)}</span>
            <span className="t">{p.out && p.finished ? '✓' : p.score}</span>
          </li>
        ))}
      </ul>

      {showNextPrompt && (
        <div className="overlay" onClick={() => setAckSeq(lastDart.seq)}>
          <div className="sheet">
            {lastWasBust && <div className="banner sudden">Bust!</div>}
            {state.lastEvent === 'checkout' && <div className="banner win">Checked out!</div>}
            <p className="muted">{sudden ? 'Sudden death' : state.phase === 'redemption' ? 'Redemption round' : 'Pass the phone'}</p>
            <p className="next">
              Next player:
              <br />
              <strong>{nameOf(current.playerId)}</strong>
            </p>
            <p className="muted">{current.score} left</p>
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

/** Single/Double/Treble toggle, numbers 1-20, Bull and Miss. */
function DartPad({
  mult,
  setMult,
  onDart,
}: {
  mult: Multiplier
  setMult: (m: Multiplier) => void
  onDart: (segment: number | null, m: Multiplier) => void
}) {
  return (
    <div className="dartpad">
      <div className="seg mult">
        {(['Single', 'Double', 'Treble'] as const).map((label, i) => (
          <button key={label} className={mult === i + 1 ? 'on' : ''} onClick={() => setMult((i + 1) as Multiplier)}>
            {label}
          </button>
        ))}
      </div>
      <div className="numbers">
        {[...Array(20).keys()].map((i) => (
          <button key={i} onClick={() => onDart(i + 1, mult)}>
            {i + 1}
          </button>
        ))}
        <button className="bull" disabled={mult === 3} onClick={() => onDart(BULL, mult)}>
          {mult === 2 ? 'Bull 50' : 'Bull 25'}
        </button>
        <button className="miss" onClick={() => onDart(null, 0)}>
          Miss
        </button>
      </div>
    </div>
  )
}

/** Keypad for a whole visit's total, then the checkout questions when they matter. */
function VisitPad({
  score,
  askDouble,
  onVisit,
}: {
  score: number
  askDouble: boolean
  onVisit: (total: number, dartsUsed: number, dartsAtDouble: number) => void
}) {
  const [text, setText] = useState('')
  const [step, setStep] = useState<'total' | 'darts' | 'double'>('total')
  const [dartsUsed, setDartsUsed] = useState(3)
  const total = Number(text || 0)
  const valid = total <= 180 && !IMPOSSIBLE_VISIT_TOTALS.includes(total)
  const checkout = total === score

  const submit = () => {
    if (checkout) setStep('darts')
    else if (askDouble) setStep('double')
    else onVisit(total, 3, 0)
  }

  if (step === 'darts') {
    return (
      <div className="question">
        <p>Checked out {total}! Which dart finished it?</p>
        <div className="answers">
          {[1, 2, 3].map((n) => (
            <button key={n} className="primary" onClick={() => (askDouble ? (setDartsUsed(n), setStep('double')) : onVisit(total, n, 1))}>
              {['1st', '2nd', '3rd'][n - 1]}
            </button>
          ))}
        </div>
      </div>
    )
  }
  if (step === 'double') {
    const max = checkout ? dartsUsed : 3
    return (
      <div className="question">
        <p>How many darts were thrown at a double?</p>
        <div className="answers">
          {[...Array(max + 1).keys()].filter((n) => !checkout || n >= 1).map((n) => (
            <button key={n} className="primary" onClick={() => onVisit(total, checkout ? dartsUsed : 3, n)}>
              {n}
            </button>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className="visitpad">
      <div className={valid ? 'display' : 'display bad'}>{text || '0'}</div>
      <div className="keys">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button key={n} onClick={() => text.length < 3 && setText(text + n)}>
            {n}
          </button>
        ))}
        <button onClick={() => setText(text.slice(0, -1))}>⌫</button>
        <button onClick={() => text && text.length < 3 && setText(text + '0')}>0</button>
        <button className="primary" disabled={!valid} onClick={submit}>
          OK
        </button>
      </div>
    </div>
  )
}
