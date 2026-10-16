// Shared types for game rules. These mirror the data model in SPEC.md section 3.

export type Multiplier = 0 | 1 | 2 | 3
export type BullType = 'inner' | 'outer' | null
export type Phase = 'normal' | 'redemption' | 'sudden_death'

/** The number used for the bull everywhere in the app. */
export const BULL = 25

/** One finishing place in a ranking. Players who share a place have the same `place`. */
export interface Placing {
  playerId: string
  place: number
}
