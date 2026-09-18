# MTG Play Mat

A desktop playtest table for Magic: The Gathering decks. It opens three windows:

- **App**: deck list, deck import, and a collection browser.
- **Board**: the battlefield, library, and graveyard. Screenshare this one.
- **Hand**: a small frameless window with your hand. It stays private.

The board and hand open together when a play test starts, and closing either one
closes both.

Built with Electron, electron-vite, React 19, TypeScript, Tailwind CSS 4, and MobX.

## Status

This is an early-stage personal project and is being revived. The app starts and the
play test windows work with a built-in sample deck. Card data isn't set up yet: the
app looks for SQLite databases in `<userData>/db/` (`AllPrintings.sqlite`,
`Decks.sqlite`). If they're missing, the deck and collection views are empty.
Automatic card data download is planned.

## Development

Requires Node 24.

```sh
npm install
npm run dev            # app window with hot reload
npm run dev:play-test  # opens the board and hand with the sample deck
```

In development builds, **View → Open Sample Play Test** (`Cmd/Ctrl+Shift+P`) loads a
fixture deck into the board and hand windows. Click the library to draw, and click a
card in your hand to play it.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run test:e2e       # builds, then runs the Playwright Electron smoke test
```

The end-to-end test launches real windows, so it needs a desktop session (or a
virtual display such as `xvfb-run` on Linux). It sets `MTG_PLAY_MAT_TEST_HOOKS=1`,
which lets it open the sample play test from the main process.

## IPC

Renderers have no Node or raw `ipcRenderer` access. The preload exposes one object,
`window.api`, built from the contract in `src/shared/ipc/contract.ts`: a function
per request (renderer → main, `invoke`/`handle`) and an `on<Event>(listener)`
subscription per push (main → renderer) that returns an unsubscribe function. To add
a channel, add one line to `requests` or `events`; the type checker then requires a
handler in main, and the renderer gets the typed function automatically.

## Game state

The game engine in `src/shared/game/` is pure TypeScript with no Electron or React
imports. A `GameState` is plain JSON: players, zones as ordered instance ids, card
instances that carry their own display data (`CardRef`), a seeded PRNG, and an action
log. `reduce(state, action)` is the only way to change it. The generic core
(`core.ts`) handles zones and movement; `mtg.ts` adds Magic rules such as tapping and
what happens when a card leaves the battlefield.

The main process owns the authoritative state. Windows send actions through
`window.api.dispatch` and receive views: the hand gets `privateView` (including hand
contents), and the board gets `publicView`, which never contains hand or library card
identities. A reloaded window fetches its current view, so nothing is lost.

## Playing a test game

A new game shuffles and draws seven. The hand window offers **Keep** or **Mulligan**
(London: each mulligan draws a fresh seven; on keep you pick one card per mulligan to
put on the bottom). The board shows life (click the number to set it), Untap all,
Draw N, Shuffle, and Restart, plus the library, hand count, graveyard, and exile.
Right-click any card for "Move to…" (hand, battlefield, graveyard, exile, library
top/bottom) or "Shuffle into library". Click the graveyard or exile to browse it.
Drag a battlefield card onto a pile to move it there. Hovering a card shows a large
preview in that window only.

Shortcuts (in either window): **D** draw, **U** untap all, **S** shuffle, **M**
mulligan (until you keep), **?** help. Keys with Cmd/Ctrl/Alt are left alone.

## Building

```sh
npm run build          # typecheck + bundle to out/
npm run build:unpack   # unpacked app in dist/ (quick local test)
npm run build:mac      # or build:win / build:linux
```

Builds are unsigned and meant for personal use.
