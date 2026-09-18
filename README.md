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

## Building

```sh
npm run build          # typecheck + bundle to out/
npm run build:unpack   # unpacked app in dist/ (quick local test)
npm run build:mac      # or build:win / build:linux
```

Builds are unsigned and meant for personal use.
