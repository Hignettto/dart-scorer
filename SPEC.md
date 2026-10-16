# Darts Scorer – Project Spec

A personal, phone-first web app for scoring darts in the office. One phone, passed between players. Saved player profiles, per-dart recording, stats per profile. Installable to the iPhone home screen and works offline.

The owner has very little coding experience. **Claude Code: explain what you are doing in plain language, work in small steps, commit after each working step, and write automated tests for all game rules before building screens.**

---

## 1. Tech stack

| Piece | Choice |
|---|---|
| Build tool | Vite |
| UI | React + TypeScript |
| Storage | IndexedDB via Dexie |
| Install / offline | vite-plugin-pwa |
| Tests | Vitest |
| Hosting | GitHub Pages (or Netlify), HTTPS |
| Voice (experimental) | Web Speech API, behind a settings toggle |

No backend. No accounts. All data lives on the device.

## 2. Architecture rules

- **Game rules are pure functions**, separate from UI: `applyDart(state, dart) -> newState`.
- **Every dart is stored as an event.** Game state is always rebuilt by replaying the game's darts in order. Stats are never stored, only calculated from darts.
- **Undo** = remove the last dart event and replay. Undo works across player changes, back to the start of the game.
- Mobile-first, portrait, large touch targets (min 64px), readable from arm's length.

## 3. Data model

```
Player     { id, nickname, createdAt, archived: boolean }
Game       { id, mode: 'rtw' | 'x01', settings (JSON), startedAt, endedAt,
             status: 'in_progress' | 'finished' | 'abandoned', winnerId }
GamePlayer { gameId, playerId, throwOrder, finishPosition, finished: boolean }
Dart       { id, gameId, playerId, seq (global order within game),
             leg (1 = main game; 2+ = X01 sudden-death legs; always 1 in RTW),
             round, dartInVisit (1-3), phase: 'normal' | 'redemption' | 'sudden_death',
             target,            // what they were aiming at: 1-20 or 25 (bull); null in X01 if not applicable
             segment,           // number actually hit: 1-20, 25 (bull), or null for miss/unknown
             multiplier,        // 0 = miss, 1 = single, 2 = double, 3 = treble
             bullType,          // 'inner' | 'outer' | null
             timestamp }
```

Timestamps are recorded but no time-based stats are planned.

## 4. Players and profiles

- Create, rename and archive players (archive hides them but keeps their history). Nicknames only.
- Nicknames must be unique.
- Game setup: tap players from a list to add them (1–8), in throwing order; drag or arrows to reorder.
- Throwing order is set manually at setup for every game. Players get equal visits, so order is not used to adjust results, but it is recorded for analysis.
- Offer "Rematch" after a game: same players, order editable before starting.
- Optional "Guest" player that is not saved to stats.

## 5. Round the World (main game – build first)

### Rules

1. Targets in order: 1, 2, … 20, then Bull.
2. Single advances 1, double advances 2, treble advances 3.
3. **Advancing caps at 20.** You cannot reach Bull with a double or treble. You must be on Bull as the target, then hit it.
4. On Bull, either **outer or inner bull finishes**. Record which one (`bullType`).
5. Every visit is 3 darts, even after misses. No visit limit.
6. If a player finishes on dart 1 or 2 of a visit, their remaining darts are not thrown.
7. **Redemption:** when a player finishes, the round is completed so every player has had the same number of visits. Players later in the throwing order get their visit.
   - If nobody else finishes in that round, the first finisher wins.
   - If the finisher was last in the throwing order, the game ends at once.
8. **Sudden death:** if two or more players finish in the same round, players who did not finish are out, and the finishers go to sudden death.
   - Each finisher throws a full 3-dart visit at Bull, in throwing order. All 3 darts are always thrown.
   - Inner and outer bull are equal. Hitting Bull with any dart = survives the round. Missing with all 3 = out.
   - Hitting earlier (e.g. dart 1, or first in throwing order) gives no advantage.
   - If all remaining players hit, or all miss, the round is replayed with the same players.
   - It continues until exactly one player hits in a sudden-death round. That player wins.
9. **Ranking (all places):**
   - 1st: the winner.
   - Next: players knocked out in sudden death. Those who went out in a later sudden-death round rank higher. Players who went out in the same round share a place.
   - Next: players who did not finish, ranked by how far they got (Bull > 20 > 19 …).
   - Ties between non-finishers: the player who reached that target in fewer darts ranks higher. If still tied, they share a place.

### Input screen

- Large display: current player, their current target, darts left this visit, and every player's current target.
- **Four big buttons: Single · Double · Treble · Miss.**
  - When the target is Bull, these become **Outer Bull · Inner Bull · Miss**.
- Undo button, always visible.
- Clear "Next player: X" prompt at the end of each visit (the phone is being passed).
- Banners for "Redemption round" and "Sudden death".

### Rule test cases (must pass as automated tests)

| On | Dart | Result |
|---|---|---|
| 3 | Double | Now on 5 |
| 3 | Treble | Now on 6 |
| 18 | Single | Now on 19 |
| 18 | Double | Now on 20 |
| 18 | Treble | Now on 20 (capped) |
| 19 | Treble | Now on 20 (capped) |
| 20 | Single | Now on Bull |
| 20 | Treble | Now on Bull (not finished) |
| Bull | Outer bull | Finished, bullType = outer |
| Bull | Inner bull | Finished, bullType = inner |
| Any | Miss | No change, dart still counts |

**Game-flow tests (3 players, order P1, P2, P3):**

- P1 finishes, P2 and P3 do not finish in that round → P1 wins.
- P3 finishes before anyone else → game ends at once, P3 wins.
- P1 finishes, P2 misses, P3 finishes → P2 out, P1 and P3 go to sudden death.
- Sudden death: P1 hits Bull, P3 misses → P1 wins.
- Sudden death: P1 hits on dart 3, P3 hits on dart 1 → both survive, repeat.
- Sudden death: both hit → repeat. Both miss → repeat.
- Sudden death: P3 hits Bull with dart 1 → P3 still throws darts 2 and 3 (they are recorded).
- Ranking: P1 wins sudden death vs P3, P2 did not finish → 1st P1, 2nd P3, 3rd P2.
- Ranking: 4 players, P2 finishes alone, P1 on 18, P3 on 18 (reached it in fewer darts than P1), P4 on 12 → 1st P2, 2nd P3, 3rd P1, 4th P4.

## 6. X01 (build second)

### Settings

- Start: 301 or 501
- Double-in: on/off
- Double-out: on/off
- Input mode: per dart (default) or per visit total

### Rules

- **Double-in:** no score counts until the player hits a double. That double itself counts.
- **Double-out:** the finishing dart must be a double or inner bull (inner bull = 50 = double 25).
- **Bust:** the visit's score is cancelled, the score goes back to what it was at the start of the visit, and the remaining darts in the visit are void. A bust happens when:
  - the score would go below 0, or
  - with double-out, the score would land on exactly 1, or
  - with double-out, the score would reach 0 on a non-double.
- **Game end:** first player to reach exactly 0. Redemption applies exactly as in Round the World.
- **Sudden death:** the tied players play a new leg from **170, double-out** (no double-in, whatever the game's setting). Players who didn't finish the original leg are out.
  - Same throwing order as the main game. Normal bust rules and redemption apply.
  - First to check out wins, unless another player also checks out in the redemption part of that round.
  - If two or more check out in the same round, the others are out and those players play another 170 leg. Repeat until one clear winner.
  - Darts are stored with `leg` = 2, 3 … and `phase` = 'sudden_death'.
- **Ranking:** winner, then sudden-death losers (as in Round the World), then non-finishers by lowest remaining score. Ties share a place.
- **Checkout hints:** show a suggested finish when the remaining score can be checked out with the darts left. With double-out, the maximum is 170. These cannot be checked out with 3 darts: 159, 162, 163, 165, 166, 168, 169. Use a standard checkout table.

### Input screen

- Grid of 1–20 plus Bull, a Single/Double/Treble toggle, and a Miss button.
- Per-visit mode: number keypad for the visit total. Then ask "darts at double?" when relevant for checkout stats.

## 7. Stats (per player profile)

### Round the World

- Games played, wins, win %.
- Average and best **darts to finish**.
  - Only finished games count, and only up to the original finishing dart (not sudden death).
  - Always show how many games the average is based on.
- **Hit rate per target (1–20, Bull):** darts that hit the target ÷ darts thrown at it.
  - Always show the number of attempts. Grey out targets with fewer than 20 attempts.
  - Display as a ranked "easiest → hardest" list and as a dartboard heatmap.
- Doubles and trebles hit: counts, and % of darts thrown.
- Bull finishes: inner vs outer split.
- Sudden-death record (played / won).
- Head-to-head vs each other player.

### X01

- 3-dart average and first-9 average.
- Checkout %: successful finishes ÷ darts thrown at a finishing double.
- Highest checkout. Counts of 100+, 140+ and 180.

### Note on bias

Players who don't finish don't add a darts-to-finish figure. Show win % and finished-game count next to averages so the averages aren't misleading.

## 8. Match history

- List of past games: date, mode, players, winner.
- Tap a game to see a full dart-by-dart log.
- An in-progress game survives closing the app, and can be resumed or abandoned.

## 9. Backup (essential – data only exists on this phone)

- **Export all data as JSON** (full backup) and **import JSON** (restore).
- **Export darts as CSV** for analysis in a spreadsheet or Python.
- Show "Last backup: X days ago" on the home screen.

## 10. Voice input (experimental, last)

- Toggle in settings, off by default.
- Phrases:
  - Round the World: "single", "double", "treble", "miss", "outer", "inner", "undo".
  - X01: "treble twenty", "double sixteen", "single five", "bull", "outer bull", "miss", "undo".
- Always show what was heard and apply it visibly, so undo can fix mistakes.
- iPhone Safari support is unreliable. Buttons must always remain available.

## 11. Build order (each step must be working and committed before the next)

1. Project setup, deploy a "hello" page to GitHub Pages, install it on the iPhone.
2. Round the World rules engine plus all tests in section 5.
3. Player profiles (create, select, order).
4. Round the World game screen with undo, saving darts to IndexedDB, resume after closing.
5. JSON / CSV export and import.
6. Match history.
7. Round the World stats.
8. X01 engine plus tests, then the X01 screen and X01 stats.
9. Voice input.

### Export formats

**Full backup:** a single JSON file, `darts-backup-YYYY-MM-DD.json`, containing `app`, `exportVersion` (start at 1), `exportedAt`, plus `players`, `games`, `gamePlayers` and `darts` arrays exactly as stored. On import, check `exportVersion` and migrate older formats rather than rejecting them.

**Analysis exports (CSV):** three files. Each includes `player_id` as well as the current nickname, so renames don't break history. Columns marked *derived* are calculated during export by replaying the game; they are not stored.

1. `games.csv`: one row per player per game.
   `game_id, date, mode, settings, player_id, player, throw_order, finish_position, finished, darts_to_finish, result`
   - `result` = `won` / `lost` / `sudden_death_lost`
   - `darts_to_finish` counts the original finish only, not sudden death.
2. `rtw_darts.csv`: one row per Round the World dart.
   `game_id, date, player_id, player, throw_order, round, phase, visit_dart, target, multiplier, bull_type, hit, position_before, position_after, finished`
   - `target` 25 = Bull
   - `multiplier` 0–3
   - `hit` 1/0 (*derived*)
   - `position_before` / `position_after` (*derived*)
3. `x01_darts.csv`: one row per X01 dart.
   `game_id, date, player_id, player, throw_order, leg, round, phase, visit_dart, segment, multiplier, bull_type, points, score_before, score_after, visit_bust, checkout`
   - `points` = segment × multiplier; outer bull = 25, inner bull = 50 (*derived*)
   - `score_after` on a busting dart = the score at the start of the visit
   - `visit_bust` = 1 on every dart of a busted visit (*derived*)

## 13. Stats to add later (not built yet)

- Win % by throwing position, to check whether order affects results.
