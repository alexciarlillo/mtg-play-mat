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
- `db/Decks.sqlite`: your decks. Each card row is a Scryfall printing id, a
  quantity, and a board (main, side, or commander).
- `image-cache/`: card images. Pages load images as
  `card://<scryfallId>/<face>/<size>`. The main process serves those from this cache,
  fetching from Scryfall's CDN only on a miss, so an image seen once works offline.

SQLite is Node's built-in `node:sqlite`, so there's no native module to rebuild.

## Decks

**Import a deck** takes a pasted list in plain text (`4 Name`, `4x Name`), MTGA
(`4 Name (SET) 123`, with `About`/`Name`, `Commander`, `Deck`, `Sideboard`, and
`Companion` sections, or a sideboard after the last blank line), or Moxfield
(`*F*`/`*E*` finish markers and `#tags` are ignored). `Maybeboard`/`Considering`
lines are skipped and reported. Names match regardless of case, accents, and
punctuation, and `Front // Back` cards match by full or front-face name.

Each line resolves by set and collector number, then name and set, then name only.
Name only picks the newest English, paper, non-promo printing with an image. Before
anything is saved, a report lists resolved, unresolved, and ignored lines. Every
unresolved line must be fixed (search for the right card) or skipped. A commander
section makes the deck a Commander deck.

The deck page groups cards by board and type. You can change quantities, move
cards between boards, remove or add cards, switch any card's printing, pick the
cover card, rename the deck, change its format, and copy it as MTGA or Moxfield
text. **Play test** shuffles the main board into the library and puts the commander
board in the command zone; the sideboard stays out.

## Online play

Two ways to connect, on two tabs of the **Play online** page, both carrying the same
messages. The default is a **lobby code**: the host gets a six-character code from a relay
server and reads it out; everyone else types it in. The relay is in this repo under
[`server/`](server/README.md) and is meant to be run on your own box — point the app at it
under **Settings → Online play**, with the key its `RELAY_APP_KEYS` lists for
`mtg-play-mat`. The fallback is **Invite codes**: players paste WebRTC offer and answer codes
to each other and no server is involved at all.

Either way a pod is a star — guests talk to the host, and the host passes messages on. Hands
and libraries never leave the machine they are on.

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
Draw N, Shuffle, Token…, and Restart, plus the library, hand count, graveyard, and exile.
Right-click any card for "Move to…" (hand, battlefield, graveyard, exile, library
top/bottom) or "Shuffle into library". Click the graveyard or exile to browse it.
Drag a battlefield card onto a pile to move it there. Hovering a card shows a large
preview in that window only.

**Play area background:** pick a PNG or JPEG under **Settings → Play area** and it is drawn
under your battlefield, shaped like a real 24x14 playmat. It is an object on the table
rather than wallpaper behind the window: it lives in the same logical units as the cards
(`MAT_WIDTH` x `MAT_HEIGHT` in `layout.ts`), so it scales with them. A card left on a patch
of art stays on that patch whatever size the window is, and a wide window shows bare table
beside the mat instead of stretching or re-cropping the picture. Main keeps two copies of
the image in `mats/` under the user data directory and serves them over a `mat://` scheme
like card images: a display copy up to 2048px wide, and a smaller one for sending to other
players. A mat is named by the hash of the bytes that travel.

Everyone at the table sees everyone's mat. It goes out as one `mat` message when a link
opens and whenever you change it, which is why the share copy is squeezed under 180KB:
base64'd, that still fits in one 256KB message and one relay frame, so there is no
chunking and nothing to reassemble. The host keeps each seat's latest mat and passes it on,
so a player who joins later gets it without anyone resending. Arriving bytes are only kept
if they hash to the id they came under, so a peer can only ever add the mat it actually
sent. If someone's picture is more distracting than fun, the photo button on their seat
hides it on your board alone.

Card manipulation (right-click a permanent unless noted):

- **Counters:** add +1/+1 or -1/-1 (they cancel in pairs), loyalty ± on planeswalkers
  (which enter with their printed loyalty), or any named counter via "Add counter…".
  Hovering a permanent shows small ± steppers. A P/T badge appears when counters change
  a creature's stats. Poison, energy, and experience sit under the life total.
- **Tokens:** right-click the battlefield (or use **Token…**) to search token printings
  in the card database, pick one and a quantity, or make a custom token (name, type,
  P/T; drawn as a plain frame). "Create copy" makes a token copy of a permanent. Tokens
  cease to exist when they leave the battlefield.
- **Face down:** "Turn face down/up", or "Play face down" from the hand. The board
  shows a card back with a 2/2 badge; only the hand window's "Face down" strip shows
  what it is.
- **Transform:** double-faced, flip, and meld cards cycle faces. A modal DFC in hand can
  be played as its back face.
- **Attach:** "Attach to…" picks a host. Attachments sit behind the host and move with
  it. Dragging an attachment away (or "Detach") frees it, and it stays on the
  battlefield when its host leaves.

The opponent's half of an online board shows all of the above read-only.

Shortcuts (in either window): **D** draw, **U** untap all, **S** shuffle, **M**
mulligan (until you keep), **?** help. Keys with Cmd/Ctrl/Alt are left alone.

### Commander

A deck whose format is Commander starts at 40 life with its commander board (one
commander, or two for partners/backgrounds) in the command zone on the board panel.
Click a commander there to cast it. Each cast from the command zone adds 2 to its
tax ("Tax +2"), which is shown for each commander wherever it is. Right-click a
commander to fix the tax by hand or to move it to the command zone. Commanders wear
a crown badge. When a commander goes to the graveyard, exile, hand, or library, the
board asks **Return to command zone?**. Main keeps that prompt, so it survives a
reload, and the engine itself only moves cards.

For goldfishing, **+ Opponent** (or right-click the board, then **Add placeholder
opponent**) adds up to three stand-in opponents. Each has a life total and the
commander damage it took from each of your commanders. Online, the panel lists the
opponent's commanders under **Commander damage taken**, so you can record what they
dealt you. Commander damage also changes life, and 21 or more from one commander is
flagged as lethal. The command zone, tax, commander damage, and placeholder opponents
are all public, so they show on the opponent's board read-only.

## Playing online

**Play online** in the app window connects you directly to up to three other players
(WebRTC, no server). Set your name, then:

1. The host clicks **Host a game**. Seat 2 gets an invite code (or a
   `mtgplaymat://join?c=…` link) to send to one player; **Invite seat 3** and
   **Invite seat 4** make one for each further player. Every seat has its own codes.
2. Each player clicks **Join a game**, pastes their invite (a link fills it in), and
   sends back the reply code.
3. The host pastes each reply into that seat and clicks **Connect**.

A pod is a star: every guest connects only to the host, and the host passes each
guest's messages on to the others unchanged. Receivers still check every message
against its original sender, and the host binds each link to the player who said
hello on it, so nobody can speak for someone else. The host sends everyone the seat
list.

Hosting is independent of the play test. Once players are connected and have a game
open, each board shows the other players' battlefields, graveyards, exile, command
zones, life, mulligans, and hand and library counts, read-only. With one opponent the
board splits in two. With two or three opponents they sit in a row across the top, in
turn order, each scaled to fit. Each player sends only their own public view, so
hand contents and library order never leave the machine. In a Commander game you can
record commander damage from every opponent's commander.

The **Table** panel on the board (drag it by its title, or fold it away) holds the
action log and the dice. Every player's actions ("Bob drew 2 cards", "Alice played
Forest") show up on every board, built only from public information: cards drawn,
searched for, or put into a hand or library are counted, never named. Its **Dice**
tab shows just the rolls. While a player has Look at top or Search library open,
their library pile is ringed and badged on their own board and every opponent's, and
the log says so once; it clears when the dialog closes. Looking at the top is silver
("Top 3…") and a search gold ("Searching…"), so the two never read alike across the
table. A life total that just changed flashes too — red for damage, green for life
gained — and fades back over a second, on your own counter and on every opponent's,
so a hit lands visibly even with the log folded away.
Each opponent's seat carries its own log under their command zone: just that
player's actions and the rolls they asked for, newest first, scrolling. It takes
whatever room the opponents row has left over, so dragging the row taller buys more
history without taking anything from the counts above it, and **Log** folds it away
(for every seat at once) when it is more noise than context.

**d6, d20, Coin, dN** ask the host to roll; the result and
who asked for it appear on every board. **Resend state** re-sends
yours. **Leave** disconnects: when a guest leaves, only their seat is removed and the
host can invite that seat again. When the host leaves, the pod ends for everyone.
Players on a different protocol version get a "version mismatch" message.

Connections use public STUN servers (Google, Twilio) and no TURN relay, so some
strict networks (symmetric NAT, corporate firewalls) can't connect; the lobby says so.

The WebRTC connection lives in a hidden "net" window (`src/renderer/net.html`),
because Electron's main process has no `RTCPeerConnection`. Main is the hub: it builds
and validates every message (`src/shared/net/protocol.ts`, protocol version 2) and
forwards the other players' views to the board. The host's net window holds one peer
connection per guest seat.

### Debug log

**Show debug log** at the bottom of **Play online** opens a running trace of the
networked paths: settings checked, lobbies asked for and answered, sockets dialled,
opened and closed (with the close code), seats taken, hellos, message kinds and sizes,
and every failure with its reason. Any uncaught exception or unhandled rejection in
main or in any window lands there too, since that is usually why multiplayer stopped.

It is meant to be screenshotted or copied and sent on, so it is short and safe:
the header names the build, the platform and the relay host, repeated lines collapse
to one with a count, and payloads are never recorded — only kinds, sizes and seats.
The relay key and the host token are redacted out of every URL. **Clear**, retry, then
screenshot, and the log holds that attempt alone.

Main owns the one buffer (`src/main/debugLog.ts`, the last 300 lines); every window
logs into it over `logDebug` and the page renders the pushes.

Invite links: packaged builds register the `mtgplaymat://` scheme. In development
nothing is registered unless you set `MTG_PLAY_MAT_REGISTER_PROTOCOL=1`, which
registers the dev Electron binary plus this checkout (undo it by running a packaged
build, or with `app.removeAsDefaultProtocolClient`). A second launch with a link
passes it to the running app. Under test hooks, ICE servers default to none
(loopback only) and can be set with `MTG_PLAY_MAT_ICE_SERVERS` (JSON).

## Building

```sh
npm run build          # typecheck + bundle to out/
npm run build:unpack   # unpacked app in dist/ (quick local test)
npm run build:mac      # or build:win / build:linux
```

Builds are unsigned and meant for personal use.

### Releases

Push a version tag to build every platform on GitHub Actions and open a draft release:

```sh
npm version patch      # bumps package.json and creates the v* tag
git push --follow-tags
```

Review the draft on GitHub and publish it. Assets:

- **Windows:** `mtg-play-mat-<version>-portable.exe` runs on double-click with no install.
  `-setup.exe` installs it with a Start menu entry. Both are unsigned, so SmartScreen asks
  first: **More info → Run anyway**.
- **macOS:** `.dmg` for arm64 and x64. It's unsigned, so on first launch right-click the app
  and choose **Open**. If macOS says the app is damaged, run
  `xattr -cr "/Applications/MTG Play Mat.app"`.
- **Linux:** `.AppImage`. Mark it executable and run it.

The workflow can also be run by hand from the Actions tab. That builds the assets and attaches
them to the run instead of a release.
