import type { Placing } from './types'

/** Sorts by key and gives equal keys the same place. Used by both games. */
export function assignPlaces(entries: { id: string; key: number[] }[]): Placing[] {
  const cmp = (a: number[], b: number[]) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = (a[i] ?? 0) - (b[i] ?? 0)
      if (d !== 0) return d
    }
    return 0
  }
  const sorted = [...entries].sort((a, b) => cmp(a.key, b.key))
  const out: Placing[] = []
  sorted.forEach((e, i) => {
    const place = i > 0 && cmp(e.key, sorted[i - 1].key) === 0 ? out[i - 1].place : i + 1
    out.push({ playerId: e.id, place })
  })
  return out
}
