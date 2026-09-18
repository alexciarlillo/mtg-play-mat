# MTG Play Mat

A desktop playtest table for Magic: The Gathering decks. It opens three windows:

- **App**: deck list, deck import, and a collection browser.
- **Board**: the battlefield, library, and graveyard. Screenshare this one.
- **Hand**: a small frameless window with your hand. It stays private.

The board and hand open together when a play test starts, and closing either one
closes both.

Built with Electron, electron-vite, React 19, TypeScript, Tailwind CSS 4, and MobX.

## Status

This is an early-stage personal project and is being revived. The play test windows
work with imported decks or a built-in sample deck.

## Card data

Card data comes from Scryfall's `default_cards` bulk file (about 80 MB compressed).
On launch the app asks Scryfall when the file was last updated. It downloads when
there's no local data, or when Scryfall has newer data and the local copy is more
than 7 days old. **Update card data** in the app window's top bar checks right away
and skips the age limit. The download streams through gunzip into SQLite in a
utility process, with progress shown in the top bar. The new database is built in a
scratch file and swapped in once it's complete, so a failed or offline update keeps
the old data.

Everything lives in `<userData>`:

- `db/cards.sqlite`: printings, sets, and metadata. It's fully rebuildable; delete
  it to force a fresh download.
- `db/Decks.sqlite`: your decks. Card ids are Scryfall ids.
- `image-cache/`: card images. Pages load images as
  `card://<scryfallId>/<face>/<size>`. The main process serves those from this cache,
  fetching from Scryfall's CDN only on a miss, so an image seen once works offline.

SQLite is Node's built-in `node:sqlite`, so there's no native module to rebuild.

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
which lets it open the sample play test from the main process and skips the launch
card data check. The card data test sets `MTG_PLAY_MAT_BULK_DATA_URL` to a local
server that serves a small fixture bulk file, so no test downloads the real one.

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
