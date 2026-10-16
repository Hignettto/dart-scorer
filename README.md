# Darts Scorer

A phone-first web app for scoring darts (Round the World and X01) and keeping
stats per player. It installs to the iPhone home screen, works offline, and keeps
all data on the phone. See [SPEC.md](SPEC.md) for the full design.

## Using it

Open the GitHub Pages link on your iPhone in Safari, tap **Share → Add to Home Screen**.

## Working on it (optional, on a computer)

You need [Node.js](https://nodejs.org) 22 or newer.

```
npm install      # once, downloads the libraries
npm run dev      # runs the app at http://localhost:5173
npm test         # runs the automated rules tests
npm run build    # makes the production version in dist/
```

## How the code is organised

- `src/engine/` – the game rules as plain functions, with tests next to them
  (`*.test.ts`). No screens in here, so the rules can be tested on their own.
- `src/` – the screens (React).

Every dart is stored, and the game state is rebuilt by replaying the darts.
Undo just removes the last dart and replays.
