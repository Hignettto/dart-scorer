import { describe, expect, it } from 'vitest'
import type { Dart } from './db'
import { dartLabel, groupVisits } from './history'

const dart = (p: Partial<Dart>): Dart => ({
  id: String(Math.random()), gameId: 'g', playerId: 'a', seq: 1, leg: 1, round: 1, dartInVisit: 1,
  phase: 'normal', target: 1, segment: 1, multiplier: 1, bullType: null, timestamp: 0, ...p,
})

describe('history', () => {
  it('labels darts', () => {
    expect(dartLabel(dart({ segment: 7, multiplier: 3 }))).toBe('T7')
    expect(dartLabel(dart({ segment: null, multiplier: 0 }))).toBe('Miss')
    expect(dartLabel(dart({ segment: 25, multiplier: 1, bullType: 'outer' }))).toBe('Outer')
    expect(dartLabel(dart({ segment: 25, multiplier: 2, bullType: 'inner' }))).toBe('Inner')
  })

  it('groups darts into visits, including a short finishing visit', () => {
    const v = groupVisits([
      dart({ playerId: 'a', dartInVisit: 1 }),
      dart({ playerId: 'a', dartInVisit: 2 }),
      dart({ playerId: 'b', dartInVisit: 1 }),
      dart({ playerId: 'b', dartInVisit: 2 }),
      dart({ playerId: 'b', dartInVisit: 3 }),
      dart({ playerId: 'a', round: 2, dartInVisit: 1 }),
    ])
    expect(v.map((x) => [x.playerId, x.round, x.darts.length])).toEqual([
      ['a', 1, 2],
      ['b', 1, 3],
      ['a', 2, 1],
    ])
  })
})
