// Per-player stats (SPEC.md section 7, Round the World).

import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { readAll } from '../data/backup'
import { db } from '../data/db'
import { sortPlayers } from '../data/players'
import { BULL } from '../engine/types'
import { finishedRtwGames, MIN_ATTEMPTS, rankTargets, rtwStats, type TargetRate } from '../stats/rtwStats'
import { Header } from './ui'

const pct = (x: number | null) => (x == null ? '–' : `${Math.round(x * 100)}%`)
const label = (t: number) => (t === BULL ? 'Bull' : String(t))
/** Red (0%) through amber to green (100%). */
const rateColour = (r: number) => `hsl(${Math.round(r * 120)}, 55%, 38%)`

export function StatsScreen({ onBack }: { onBack: () => void }) {
  const data = useLiveQuery(() => readAll(db), [])
  const games = useMemo(() => (data ? finishedRtwGames(data) : []), [data])
  const [playerId, setPlayerId] = useState<string>()
  if (!data) return <div className="screen">Loading…</div>

  const players = sortPlayers(data.players.filter((p) => !p.archived))
  const nameOf = (id: string) => data.players.find((p) => p.id === id)?.nickname ?? 'Guest'
  const selected = playerId ?? players[0]?.id
  const s = selected ? rtwStats(data, selected, games) : undefined

  return (
    <div className="screen">
      <Header title="Stats" onBack={onBack} />
      <div className="chips">
        {players.map((p) => (
          <button key={p.id} className={p.id === selected ? 'chip primary' : 'chip'} onClick={() => setPlayerId(p.id)}>
            {p.nickname}
          </button>
        ))}
      </div>
      {!s && <p className="empty">Add players and finish a game to see stats.</p>}
      {s && s.played === 0 && <p className="empty">{nameOf(selected!)} hasn't finished a Round the World game yet.</p>}
      {s && s.played > 0 && (
        <>
          <h2>Round the World</h2>
          <div className="tiles">
            <Tile value={s.played} label="games" />
            <Tile value={s.wins} label="wins" />
            <Tile value={pct(s.winPct)} label="win rate" />
          </div>
          <div className="tiles">
            <Tile value={s.avgDartsToFinish?.toFixed(1) ?? '–'} label={`avg darts to finish`} />
            <Tile value={s.bestDartsToFinish ?? '–'} label="best" />
          </div>
          <p className="muted small-print">
            Darts-to-finish is based on {s.finishedGames} of {s.played} games ({s.played - s.finishedGames} not finished, so not
            counted). Sudden-death darts are not included.
          </p>

          <h2>Hit rate by target</h2>
          <Heatmap targets={s.targets} />
          <p className="muted small-print">Grey = fewer than {MIN_ATTEMPTS} attempts, not enough to judge yet.</p>
          <ol className="list rates">
            {rankTargets(s.targets).map((t, i) => (
              <li key={t.target} className={t.attempts < MIN_ATTEMPTS ? 'row few' : 'row'}>
                <span className="pos">{i + 1}</span>
                <span className="grow name">{label(t.target)}</span>
                <span className="bar">
                  <span style={{ width: `${(t.rate ?? 0) * 100}%` }} />
                </span>
                <span className="rate">{pct(t.rate)}</span>
                <span className="n">{t.attempts}</span>
              </li>
            ))}
          </ol>
          <p className="muted small-print">Easiest to hardest. The last column shows the number of attempts.</p>

          <h2>Doubles, trebles and bull</h2>
          <div className="tiles">
            <Tile value={s.doubles} label={`doubles · ${pct(s.numberDarts ? s.doubles / s.numberDarts : null)}`} />
            <Tile value={s.trebles} label={`trebles · ${pct(s.numberDarts ? s.trebles / s.numberDarts : null)}`} />
          </div>
          <div className="tiles">
            <Tile value={s.innerBullFinishes} label="inner bull finishes" />
            <Tile value={s.outerBullFinishes} label="outer bull finishes" />
          </div>
          <div className="tiles">
            <Tile value={`${s.suddenDeathWon} / ${s.suddenDeathPlayed}`} label="sudden deaths won" />
          </div>

          {s.headToHead.length > 0 && (
            <>
              <h2>Head to head</h2>
              <ul className="list">
                {s.headToHead.map((h) => (
                  <li key={h.opponentId} className="row h2h">
                    <span className="grow name">vs {nameOf(h.opponentId)}</span>
                    <span>
                      <b className="w">{h.wins}W</b> <b className="l">{h.losses}L</b>
                      {h.draws > 0 && <b className="d"> {h.draws}D</b>}
                    </span>
                    <span className="muted">{h.games} games</span>
                  </li>
                ))}
              </ul>
              <p className="muted small-print">A win = finished above them in the same game.</p>
            </>
          )}
        </>
      )}
    </div>
  )
}

function Tile({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="tile">
      <div className="v">{value}</div>
      <div className="l">{label}</div>
    </div>
  )
}

/** Board order, clockwise from the top. */
const BOARD = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]

function Heatmap({ targets }: { targets: TargetRate[] }) {
  const fill = (t: number) => {
    const r = targets.find((x) => x.target === t)!
    return r.attempts < MIN_ATTEMPTS || r.rate == null ? '#3a414b' : rateColour(r.rate)
  }
  const R = 80
  const point = (deg: number, r: number) => {
    const a = ((deg - 90) * Math.PI) / 180
    return `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`
  }
  return (
    <svg viewBox="-100 -100 200 200" className="heatmap" role="img" aria-label="Hit rate by number on a dartboard">
      {BOARD.map((n, i) => {
        const a0 = i * 18 - 9
        const a1 = a0 + 18
        return (
          <g key={n}>
            <path
              d={`M ${point(a0, 14)} L ${point(a0, R)} A ${R} ${R} 0 0 1 ${point(a1, R)} L ${point(a1, 14)} A 14 14 0 0 0 ${point(a0, 14)} Z`}
              fill={fill(n)}
              stroke="#111418"
              strokeWidth="1"
            />
            <text
              x={point(a0 + 9, 90).split(' ')[0]}
              y={point(a0 + 9, 90).split(' ')[1]}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="9"
              fontWeight="700"
              fill="#f2f4f7"
            >
              {n}
            </text>
          </g>
        )
      })}
      <circle r="13" fill={fill(BULL)} stroke="#111418" strokeWidth="1" />
      <text textAnchor="middle" dominantBaseline="central" fontSize="7" fontWeight="700" fill="#f2f4f7">
        Bull
      </text>
    </svg>
  )
}
