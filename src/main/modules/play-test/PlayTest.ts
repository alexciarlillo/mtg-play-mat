import { randomInt } from 'node:crypto';

import {
  actionPlayer,
  borrowedFrom,
  type CardRef,
  type CommanderMove,
  commanderMoves,
  type ControlChange,
  type Departure,
  departures,
  describeDeparture,
  describeRegain,
  describeShowing,
  describeShowingSource,
  describeStep,
  emptyGame,
  type GameAction,
  type GameState,
  isBatchAction,
  knownCards,
  type KnownLedger,
  learnFromChange,
  learnTop,
  lentCard,
  lentTo,
  libraryView,
  MAX_REVEALED_CARDS,
  NO_KNOWLEDGE,
  OPENING_HAND_SIZE,
  parseLibraryActivity,
  parsePlayerAction,
  parseRevealRequest,
  type PlayerAction,
  permanentState,
  type PlayerId,
  type PrivateLogEntry,
  privateView,
  publicName,
  publicView,
  type PublicView,
  redoAction,
  reduce,
  type RevealRequest,
  SeenList,
  type SeenPeer,
  type ShowingSource,
  type ShowingView,
  type ShownToYou,
  startingLife,
  undoLast,
  type UndoState,
} from '@shared/game';
import type { RevealChange } from '@shared/net/protocol';
import type { RevealTarget } from '@shared/net/revealTargets';
import type { DeckBoard, DeckFormat } from '@shared/types/decks';
import { isHandCommand, type PlayTestStatus } from '@shared/types/playTest';
import type { EventPayload } from '@shared/ipc/contract';
import { app, BrowserWindow, screen, type WebContents } from 'electron';

import { type GameMenuCommand, runGameMenuCommand } from '../../gameMenu';
import { type RequestHandlers, type SenderGuards, sendEvent } from '../../ipc';
import type CardDB from '../../shared/db/CardDB';
import type DeckDB from '../../shared/db/DeckDB';
import { createWindow, whenLoaded } from '../../windows';
import { toCardRef } from './cardRef';
import LibraryActivityTracker from './LibraryActivityTracker';
import { mayReadHand, mayReadLibrary } from './privateAccess';
import buildSampleDeck, { buildSampleSideboard } from './sampleDeck';

export interface LoadedDeck {
  library: CardRef[];
  command: CardRef[];
  format: DeckFormat;
  companion?: CardRef[];
  sideboard?: CardRef[];
}

interface Deps {
  cardDb: CardDB;
  deckDb: DeckDB;
  // The local player: the one seat this machine is authoritative for.
  playerId: PlayerId;
  playerName(): string;
  // Read when a play test opens: put the hand in the board window.
  handInBoard(): boolean;
}

type PublicListener = (view: PublicView | null) => void;

type StatusListener = (status: PlayTestStatus) => void;

type LogListener = (text: string) => void;

// How the play test reaches the other games at the table.
export interface ControlLink {
  send(to: PlayerId, change: ControlChange): void;
  peerName(playerId: PlayerId): string | null;
}

// How the play test shows cards to one other player.
export interface RevealLink {
  send(to: PlayerId, change: RevealChange): void;
  targets(): RevealTarget[];
}

// Cards shown to someone else, kept briefly; the shown list is longer.
const MAX_PRIVATE_LOG = 100;
const MAX_SHOWN_TO_YOU = 20;

type Showing = ShowingView & { id: number };

const badReveal = (message: string): never => {
  throw new Error(`[play-test] bad reveal: ${message}`);
};

type PlayTestHandlers = Pick<
  RequestHandlers,
  | 'startPlayTest'
  | 'restartPlayTest'
  | 'getPlayTestStatus'
  | 'startSamplePlayTest'
  | 'closePlayTest'
  | 'dispatch'
  | 'getBoardView'
  | 'getHandView'
  | 'getCommanderPrompts'
  | 'dismissCommanderPrompt'
  | 'undo'
  | 'redo'
  | 'getUndoState'
  | 'getLibrary'
  | 'setLibraryActivity'
  | 'openHandDialog'
  | 'getLookAtTop'
  | 'setLookAtTop'
  | 'revealTo'
  | 'stopShowing'
  | 'getRevealTargets'
  | 'getShownToYou'
  | 'dismissShown'
  | 'getPrivateLog'
  | 'getSeenList'
  | 'getSeenByYou'
>;

const badActivity = (message: string): never => {
  throw new Error(`[play-test] bad library activity: ${message}`);
};

// The sample deck is a development aid, like the menu item that opens it.
const sampleDeckAllowed = () =>
  !app.isPackaged || process.env.DEBUG_PROD === 'true';

// Owns the authoritative game state and the board and hand windows, which
// only render views of it. The windows exist only while a play test is
// open, and closing either one ends the play test by closing both.
// In single-window mode the board also hosts the hand, and there is no
// hand window.
export default class PlayTest {
  private readonly cardDb: CardDB;

  private readonly deckDb: DeckDB;

  private board: BrowserWindow | null = null;

  private hand: BrowserWindow | null = null;

  // The mode the open windows were made for.
  private handInBoard = false;

  private state: GameState = emptyGame();

  private deck: LoadedDeck = { library: [], command: [], format: 'other' };

  private deckLabel: PlayTestStatus['deck'] = null;

  // The owner decides whether a commander that left for one of these
  // zones goes to the command zone instead. This is a rules prompt, not
  // game state, so it lives here rather than in the engine.
  private commanderPrompts: CommanderMove[] = [];

  // Undo never reaches back past the game's setup (the opening shuffle
  // and draw), and redo only lasts until the next new action.
  private undoFloor = 0;

  private redoStack: PlayerAction[] = [];

  // "Always look at the top card": a private aid, so it lives here and
  // never in the game, the log, or a view anyone else gets.
  private lookAtTop = false;

  private readonly libraryActivity = new LibraryActivityTracker({
    changed: () => this.pushBoardView(),
    log: (text) => this.addLogEntry(text),
  });

  private readonly playerId: PlayerId;

  private readonly playerName: () => string;

  private readonly handInBoardSetting: () => boolean;

  private readonly publicListeners = new Set<PublicListener>();

  private readonly statusListeners = new Set<StatusListener>();

  private readonly logListeners = new Set<LogListener>();

  private control: ControlLink | null = null;

  private reveal: RevealLink | null = null;

  // A side channel, not game state: never undone, and it ends at the
  // player's next action, like a reveal to everyone.
  private showing: Showing | null = null;

  // Starts somewhere random each run, so a receiver never mistakes a
  // reveal from this run for one it kept from the last.
  private revealId = randomInt(2 ** 40) * 1000;

  private shownToYou: ShownToYou[] = [];

  private privateLog: PrivateLogEntry[] = [];

  private privateLogId = 0;

  // Other players' cards seen this game, kept after their reveals end.
  private readonly seen = new SeenList();

  // What the player knows of their own library. It is not game state,
  // so undo can't make the player forget what they saw, and it is only
  // ever shown where the hand is.
  private known: KnownLedger = NO_KNOWLEDGE;

  constructor({ cardDb, deckDb, playerId, playerName, handInBoard }: Deps) {
    this.cardDb = cardDb;
    this.deckDb = deckDb;
    this.playerId = playerId;
    this.playerName = playerName;
    this.handInBoardSetting = handInBoard;
  }

  get gameState(): GameState {
    return this.state;
  }

  // The format decides starting life, so anything staging a game beside
  // this one needs it.
  get deckFormat(): DeckFormat {
    return this.deck.format;
  }

  get boardWindow(): BrowserWindow | null {
    return this.board;
  }

  get isOpen(): boolean {
    return this.board !== null || this.hand !== null;
  }

  onStatusChange = (listener: StatusListener) => {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  };

  // Dialog items bring the board forward, since that is where they open.
  runMenuCommand = (command: GameMenuCommand) => {
    if (!this.isOpen) return;
    runGameMenuCommand(command, {
      playerId: this.playerId,
      dispatch: this.dispatch,
      undo: this.undo,
      redo: this.redo,
      toBoard: (boardCommand) => {
        if (!this.board) return;
        this.board.show();
        this.board.focus();
        sendEvent(this.board, 'boardMenuCommand', boardCommand);
      },
    });
  };

  // What peers may see: the public view while a play test is open.
  currentPublicView = (): PublicView | null =>
    this.isOpen ? this.boardView() : null;

  // The board shows the same public view peers get.
  private boardView = (): PublicView | null => {
    const view = publicView(this.state, this.playerId);
    return (
      view && {
        ...view,
        libraryActivity: this.libraryActivity.current,
        showing: this.publicShowing(),
      }
    );
  };

  private publicShowing = (): ShowingView | null =>
    this.showing && {
      to: this.showing.to,
      source: this.showing.source,
      count: this.showing.count,
    };

  onPublicChange = (listener: PublicListener) => {
    this.publicListeners.add(listener);
    return () => {
      this.publicListeners.delete(listener);
    };
  };

  // Lines for the table's action log, e.g. "drew 2 cards". The player's
  // name is added by whoever shows them.
  onLogEntry = (listener: LogListener) => {
    this.logListeners.add(listener);
    return () => {
      this.logListeners.delete(listener);
    };
  };

  // Everything logged must be public: it's shown on the board, which may
  // be screenshared, and sent to every peer.
  addLogEntry = (text: string) => {
    if (!this.isOpen) return;
    this.libraryActivity.lineLogged(text);
    this.logListeners.forEach((listener) => listener(text));
  };

  private notifyPublic = () => {
    const view = this.currentPublicView();
    this.publicListeners.forEach((listener) => listener(view));
  };

  readonly handlers: PlayTestHandlers = {
    startPlayTest: (deckId) =>
      this.start(this.loadDeck(deckId), undefined, {
        id: deckId,
        name: this.deckDb.getDeck(deckId)?.name ?? 'Unknown deck',
      }),
    restartPlayTest: () => this.restart(),
    getPlayTestStatus: () => this.status(),
    startSamplePlayTest: () => {
      if (sampleDeckAllowed()) void this.openSampleDeck();
    },
    closePlayTest: () => {
      this.board?.close();
      this.hand?.close();
    },
    // Renderer input is untrusted, so parse it rather than trust its type.
    dispatch: (action: unknown) => this.dispatch(parsePlayerAction(action)),
    getBoardView: () => this.boardView(),
    getHandView: () => this.handView(),
    getCommanderPrompts: () => this.commanderPrompts,
    dismissCommanderPrompt: (instanceId: unknown) => {
      const rest = this.commanderPrompts.filter(
        (prompt) => prompt.instanceId !== instanceId
      );
      if (rest.length === this.commanderPrompts.length) return;
      this.commanderPrompts = rest;
      sendEvent(this.board, 'commanderPrompts', rest);
    },
    undo: () => this.undo(),
    redo: () => this.redo(),
    getUndoState: () => this.undoState(),
    getLibrary: () => libraryView(this.state, this.playerId) ?? [],
    // Library dialogs set this while open and clear it when they close.
    setLibraryActivity: (activity: unknown) => {
      if (!this.isOpen) return;
      this.libraryActivity.set(parseLibraryActivity(activity, badActivity));
    },
    openHandDialog: (command: unknown) => {
      if (!this.isOpen) return;
      if (!isHandCommand(command)) {
        throw new Error('[play-test] unknown hand dialog');
      }
      const target = this.handInBoard ? this.board : this.hand;
      if (!target) return;
      target.show();
      target.focus();
      sendEvent(target, 'handCommand', command);
    },
    // The board may ask too (a face-down permanent, the top card): main
    // reads the cards, so the board never holds them.
    revealTo: (request: unknown, then?: unknown) => {
      if (!this.isOpen) return;
      this.revealTo(
        parseRevealRequest(request, badReveal, MAX_REVEALED_CARDS),
        then === undefined ? undefined : parsePlayerAction(then)
      );
    },
    stopShowing: () => this.endShowing(),
    getRevealTargets: () => this.reveal?.targets() ?? [],
    getShownToYou: () => this.shownToYou,
    dismissShown: (key: unknown) => {
      const rest =
        typeof key === 'string'
          ? this.shownToYou.filter((entry) => entry.key !== key)
          : [];
      if (rest.length === this.shownToYou.length) return;
      this.shownToYou = rest;
      this.pushPrivate('shownToYou', rest);
    },
    getPrivateLog: () => this.privateLog,
    getSeenList: () => this.seen.everyone,
    getSeenByYou: () => this.seen.you,
    getLookAtTop: () => this.lookAtTop,
    setLookAtTop: (on: unknown) => {
      if (!this.isOpen) return;
      if (typeof on !== 'boolean') {
        throw new Error('[play-test] look at top must be on or off');
      }
      this.setLookAtTop(on);
    },
  };

  private setLookAtTop = (on: boolean) => {
    if (on === this.lookAtTop) return;
    this.lookAtTop = on;
    sendEvent(this.board, 'lookAtTop', on);
    sendEvent(this.hand, 'lookAtTop', on);
    if (on) this.learn(this.lookedAtTop(this.known));
  };

  // The top card the player always looks at is one they know.
  private lookedAtTop = (known: KnownLedger): KnownLedger => {
    const top = this.player()?.zones.library[0];
    if (!this.lookAtTop || top === undefined) return known;
    return learnTop(known, this.state, this.playerId, [top]);
  };

  private isPlayTestSender = (sender: WebContents) =>
    [this.board, this.hand].some((w) => w !== null && w.webContents === sender);

  private senders = () => ({
    board: this.board?.webContents ?? null,
    hand: this.hand?.webContents ?? null,
    handInBoard: this.handInBoard,
  });

  // The board is shown to others, so it only sees hidden cards when it
  // also hosts the hand.
  readonly guards: SenderGuards = {
    getLibrary: (sender) => mayReadLibrary(this.senders(), sender),
    getHandView: (sender) => mayReadHand(this.senders(), sender),
    setLibraryActivity: (sender) => this.isPlayTestSender(sender),
    openHandDialog: (sender) => this.isPlayTestSender(sender),
    setLookAtTop: (sender) => this.isPlayTestSender(sender),
    revealTo: (sender) => this.isPlayTestSender(sender),
    stopShowing: (sender) => this.isPlayTestSender(sender),
    getRevealTargets: (sender) => this.isPlayTestSender(sender),
    // Cards others showed this player are as private as the hand.
    getShownToYou: (sender) => mayReadLibrary(this.senders(), sender),
    dismissShown: (sender) => mayReadLibrary(this.senders(), sender),
    getPrivateLog: (sender) => mayReadLibrary(this.senders(), sender),
    getSeenList: (sender) => this.isPlayTestSender(sender),
    getSeenByYou: (sender) => mayReadLibrary(this.senders(), sender),
  };

  // A fixed seed is only passed by end-to-end tests, which may also ask
  // for a Commander game led by one of the sample creatures.
  openSampleDeck = (seed?: number, format: DeckFormat = 'constructed') => {
    const library = buildSampleDeck();
    const leader = library.find((ref) => ref.name === 'Colossal Dreadmaw');
    const command = format === 'commander' && leader ? [leader] : [];
    const label = { id: null, name: 'Sample deck' };
    const sideboard = buildSampleSideboard();
    const deck = { library, command, format, sideboard };
    return this.start(deck, seed, label).catch((err) => {
      console.error('[PlayTest] failed to open sample deck', err);
    });
  };

  // Commanders and the companion start in the command zone; the
  // sideboard waits outside the game, hidden like the hand.
  private loadDeck = (deckId: number): LoadedDeck => {
    const cards = this.deckDb.getDeckCards(deckId);
    const refs = (board: DeckBoard) =>
      cards
        .filter((card) => card.board === board)
        .flatMap((card) => {
          const printing = this.cardDb.getCardById({ id: card.printingId });
          if (!printing) return [];
          return Array.from({ length: card.qty }, () => toCardRef(printing));
        });
    return {
      library: refs('main'),
      command: refs('commander'),
      format: this.deckDb.getDeck(deckId)?.format ?? 'other',
      companion: refs('companion'),
      sideboard: refs('side'),
    };
  };

  // Windows may only act on the local player's cards; stale actions on
  // cards that no longer exist are dropped the same way.
  private dispatch = (action: PlayerAction, keepShowing = false) => {
    if (actionPlayer(this.state, action) !== this.playerId) return;
    const next = reduce(this.state, action);
    if (next === this.state) {
      this.learnUnchangedLook(action);
      return;
    }
    if (!keepShowing) this.endShowing(false);
    const left = departures(this.state, action, next);
    if (left.length > 0) {
      // A batch may move the player's own cards too. Its line leaves out
      // the borrowed ones, which sendHome tells with their owner's name.
      const text = isBatchAction(action)
        ? this.describe(this.state, action, next)
        : null;
      this.applyControl(next);
      if (text) this.addLogEntry(text);
      this.sendHome(left);
      return;
    }
    const text = this.describe(this.state, action, next);
    this.redoStack = [];
    this.apply(next);
    if (text) this.addLogEntry(text);
  };

  // A look that put every card back as it was changes nothing, but the
  // player still saw those cards.
  private learnUnchangedLook = (action: PlayerAction) => {
    if (action.type !== 'arrangeTop') return;
    const elsewhere = [
      action.bottom,
      action.graveyard,
      action.exile,
      action.hand,
      action.battlefield ?? [],
    ];
    if (elsewhere.some((ids) => ids.length > 0)) return;
    this.learn(learnTop(this.known, this.state, this.playerId, action.top));
  };

  // Pushes the hand view only when the player learned something new.
  private learn = (next: KnownLedger) => {
    if (next === this.known) return;
    this.known = next;
    this.pushViews();
  };

  linkControl = (link: ControlLink) => {
    this.control = link;
  };

  private nameOf = (playerId: PlayerId) =>
    this.control?.peerName(playerId) ?? 'another player';

  // A change of control is shared with another game, so neither side can
  // take back anything from before it without the two disagreeing.
  private applyControl = (next: GameState) => {
    this.undoFloor = next.log.length;
    this.redoStack = [];
    this.apply(next);
  };

  // Borrowed permanents that just left this game go to their owners.
  private sendHome = (left: Departure[]) => {
    left.forEach((departure) => {
      const { owner } = departure.card;
      this.control?.send(owner, departure.change);
      this.addLogEntry(describeDeparture(departure, this.nameOf(owner)));
    });
  };

  // The owner lets another player control one of their permanents.
  giveControl = (instanceId: string, to: PlayerId) => {
    const card = this.state.cards[instanceId];
    if (!this.isOpen || !this.control || card?.owner !== this.playerId) {
      return;
    }
    const next = reduce(this.state, { type: 'giveControl', instanceId, to });
    if (next === this.state) return;
    this.applyControl(next);
    this.control.send(to, { op: 'give', card: lentCard(card) });
    this.addLogEntry(
      `gave control of ${publicName(card)} to ${this.nameOf(to)}`
    );
  };

  // The controller hands a borrowed permanent back to its owner.
  returnControl = (instanceId: string) => {
    const card = this.state.cards[instanceId];
    if (!card || card.controller !== this.playerId) return;
    const action = {
      type: 'releaseControl' as const,
      instanceIds: [card.instanceId],
    };
    const next = reduce(this.state, action);
    if (next === this.state) return;
    this.sendHome(departures(this.state, action, next));
    this.applyControl(next);
  };

  // Another game handed over, returned, or recalled a permanent.
  receiveControl = (
    from: PlayerId,
    fromName: string,
    change: ControlChange
  ) => {
    switch (change.op) {
      case 'give':
        this.gain(from, fromName, change);
        return;
      case 'return':
        this.regain(from, fromName, change);
        return;
      case 'recall':
        this.release(from, fromName);
        return;
    }
  };

  private gain = (
    from: PlayerId,
    fromName: string,
    { card }: Extract<ControlChange, { op: 'give' }>
  ) => {
    const next = this.isOpen
      ? reduce(this.state, {
          type: 'gainControl',
          playerId: this.playerId,
          owner: from,
          card,
        })
      : this.state;
    // With no game to put it in, it goes straight back.
    if (next === this.state) {
      if (!this.state.cards[card.instanceId]) {
        this.control?.send(from, {
          op: 'return',
          instanceId: card.instanceId,
          to: 'battlefield',
          state: permanentState(card),
        });
      }
      return;
    }
    this.applyControl(next);
    this.addLogEntry(`gained control of ${publicName(card)} from ${fromName}`);
  };

  private regain = (
    from: PlayerId,
    fromName: string,
    change: Extract<ControlChange, { op: 'return' }>
  ) => {
    const card = this.state.cards[change.instanceId];
    // Only the player controlling it may send it back.
    if (card?.controller !== from || card.owner !== this.playerId) return;
    const next = reduce(this.state, {
      type: 'regainControl',
      instanceId: change.instanceId,
      to: change.to,
      ...(change.index !== undefined && { index: change.index }),
      ...(change.shuffle && { shuffle: true }),
      state: change.state,
    });
    if (next === this.state) return;
    this.applyControl(next);
    this.addLogEntry(describeRegain(card, change, fromName));
  };

  // The owner's game is gone or new, so their cards here are void.
  private release = (owner: PlayerId, ownerName: string) => {
    const cards = borrowedFrom(this.state, owner);
    if (cards.length === 0) return;
    const next = reduce(this.state, {
      type: 'releaseControl',
      instanceIds: cards.map((card) => card.instanceId),
    });
    this.applyControl(next);
    const names = cards.map((card) => publicName(card)).join(', ');
    this.addLogEntry(`gave ${names} back to ${ownerName}`);
  };

  linkReveal = (link: RevealLink) => {
    this.reveal = link;
  };

  // The players cards could be shown to changed; both windows offer them.
  revealTargetsChanged = (targets: RevealTarget[]) => {
    sendEvent(this.board, 'revealTargets', targets);
    sendEvent(this.hand, 'revealTargets', targets);
  };

  // Only to the window showing the hand: the board is screenshared
  // unless the hand is docked in it.
  private pushPrivate = <C extends 'shownToYou' | 'privateLog' | 'seenByYou'>(
    channel: C,
    payload: EventPayload<C>
  ) => {
    sendEvent(this.hand, channel, payload);
    if (this.handInBoard) sendEvent(this.board, channel, payload);
  };

  private addPrivateLine = (text: string, notice = false) => {
    this.privateLogId += 1;
    const entry: PrivateLogEntry = {
      id: this.privateLogId,
      at: Date.now(),
      text,
      ...(notice && { notice: true }),
    };
    this.privateLog = [...this.privateLog, entry].slice(-MAX_PRIVATE_LOG);
    this.pushPrivate('privateLog', this.privateLog);
  };

  // The cards a request names, read from the game rather than trusted
  // from the window; none if any of them isn't where it should be.
  private revealedCards = (request: RevealRequest): CardRef[] => {
    const player = this.player();
    if (!player) return [];
    const { cards } = this.state;
    const refs = (ids: string[]) => ids.map((id) => cards[id].ref);
    switch (request.source) {
      case 'hand':
        return refs(player.zones.hand.slice(0, MAX_REVEALED_CARDS));
      case 'card':
        return player.zones.hand.includes(request.instanceId)
          ? refs([request.instanceId])
          : [];
      case 'libraryTop':
        return refs(player.zones.library.slice(0, request.count));
      case 'search': {
        const ids = request.instanceIds;
        const distinct = new Set(ids).size === ids.length;
        return distinct && ids.every((id) => player.zones.library.includes(id))
          ? refs(ids)
          : [];
      }
      case 'faceDown': {
        const card = cards[request.instanceId];
        const own =
          card?.zone === 'battlefield' &&
          card.faceDown &&
          card.owner === this.playerId &&
          card.controller === this.playerId;
        return own ? refs([card.instanceId]) : [];
      }
    }
  };

  // Shows cards to one player only. Everyone else learns who and how
  // many, never which. An action passed along (a search moving the
  // cards it showed) runs right after, without ending the showing.
  private revealTo = (request: RevealRequest, then?: PlayerAction) => {
    const link = this.reveal;
    const target = link?.targets().find((t) => t.playerId === request.to);
    const cards = this.revealedCards(request);
    // Refused outright, search and all: the player chose to show these
    // cards to that player, never to nobody or to everyone.
    if (!link || !target?.ready || cards.length === 0) {
      const who = target?.name ?? 'That player';
      const why = !target?.ready
        ? `${who} can't be shown cards now`
        : 'Those cards have moved';
      this.addPrivateLine(`${why}, so nothing was revealed or moved.`, true);
      return;
    }
    this.endShowing(false);
    // A search that changes nothing leaves nothing to show.
    if (then) {
      const before = this.state;
      this.dispatch(then, true);
      if (this.state === before) return;
    }
    this.revealId += 1;
    const source: ShowingSource = request.source;
    this.showing = {
      id: this.revealId,
      to: target.playerId,
      source,
      count: cards.length,
    };
    link.send(target.playerId, {
      op: 'show',
      id: this.revealId,
      source,
      cards,
    });
    this.addLogEntry(describeShowing(source, cards.length, target.name));
    this.addPrivateLine(
      `You showed ${target.name} ${describeShowingSource(source, cards.length)}: ` +
        cards.map((ref) => ref.name).join(', ')
    );
    if (request.source === 'libraryTop') {
      const library = this.player()?.zones.library ?? [];
      const ids = library.slice(0, request.count);
      this.known = learnTop(this.known, this.state, this.playerId, ids);
    }
    this.pushViews();
  };

  private player = () => this.state.players.find((p) => p.id === this.playerId);

  // Tells the player shown the cards that they are no longer shown,
  // unless the player is gone. Pushes unless the caller pushes anyway.
  private endShowing = (push = true, tell = true) => {
    const was = this.showing;
    if (!was) return;
    this.showing = null;
    if (tell) this.reveal?.send(was.to, { op: 'end', id: was.id });
    if (push) this.pushViews();
  };

  // With the game closed, nothing shown either way is kept.
  private forgetReveals = () => {
    this.endShowing(false);
    this.shownToYou = [];
    this.privateLog = [];
    this.seen.clear();
  };

  // The other players as the board shows them; their reveals feed the
  // seen list, which only ever holds what the whole table saw.
  notePeers = (peers: SeenPeer[]) => {
    if (!this.isOpen) return;
    if (this.seen.notePeers(peers)) this.pushSeenList();
  };

  // The table changed: what was seen at the old one is gone.
  forgetSeen = () => {
    if (this.seen.clear()) this.pushSeen();
  };

  private pushSeenList = () => {
    sendEvent(this.board, 'seenList', this.seen.everyone);
  };

  private pushSeen = () => {
    this.pushSeenList();
    this.pushPrivate('seenByYou', this.seen.you);
  };

  // Another player showed this one cards, or stopped showing them.
  receiveReveal = (from: PlayerId, fromName: string, change: RevealChange) => {
    if (!this.isOpen) return;
    const key = `${from}:${change.id}`;
    if (change.op === 'end') {
      const known = this.shownToYou.some((e) => e.key === key && !e.ended);
      if (!known) return;
      this.shownToYou = this.shownToYou.map((entry) =>
        entry.key === key ? { ...entry, ended: true } : entry
      );
      this.pushPrivate('shownToYou', this.shownToYou);
      return;
    }
    const entry: ShownToYou = {
      key,
      from,
      fromName,
      source: change.source,
      cards: change.cards,
      at: Date.now(),
      ended: false,
    };
    this.shownToYou = [
      ...this.shownToYou.filter((e) => e.key !== key),
      entry,
    ].slice(-MAX_SHOWN_TO_YOU);
    this.pushPrivate('shownToYou', this.shownToYou);
    if (this.seen.noteShown(from, fromName, change)) {
      this.pushPrivate('seenByYou', this.seen.you);
    }
    this.addPrivateLine(
      `${fromName} showed you ${describeShowingSource(change.source, change.cards.length)}: ` +
        change.cards.map((ref) => ref.name).join(', ')
    );
  };

  // A player left or closed their game: everything that changed hands
  // with them comes home, and nothing is sent, since nobody is there.
  peerGone = (playerId: PlayerId, name: string) => {
    if (this.showing?.to === playerId) this.endShowing(true, false);
    // Nobody is left to stop showing them, so they are over.
    if (this.shownToYou.some((e) => e.from === playerId && !e.ended)) {
      this.shownToYou = this.shownToYou.map((entry) =>
        entry.from === playerId ? { ...entry, ended: true } : entry
      );
      this.pushPrivate('shownToYou', this.shownToYou);
    }
    this.release(playerId, name);
    lentTo(this.state, playerId).forEach((card) => {
      this.regain(playerId, name, {
        op: 'return',
        instanceId: card.instanceId,
        to: 'battlefield',
        state: permanentState(card),
      });
    });
  };

  // Before this game ends, every card that changed hands goes home: the
  // borrowed ones to their owners' battlefields, and the lent ones are
  // called back from whoever holds them.
  private settleControl = () => {
    const borrowed = borrowedFrom(this.state);
    if (borrowed.length > 0) {
      const action = {
        type: 'releaseControl' as const,
        instanceIds: borrowed.map((card) => card.instanceId),
      };
      const next = reduce(this.state, action);
      this.sendHome(departures(this.state, action, next));
      this.state = next;
    }
    const lent = lentTo(this.state);
    new Set(lent.map((card) => card.controller)).forEach((controller) => {
      this.control?.send(controller, { op: 'recall' });
    });
    lent.forEach((card) => {
      this.state = reduce(this.state, {
        type: 'regainControl',
        instanceId: card.instanceId,
        to: 'battlefield',
        state: permanentState(card),
      });
    });
  };

  // Built from public views of the two states, never the states.
  private describe = (
    before: GameState,
    action: PlayerAction,
    after: GameState
  ) => describeStep(before, action, after, this.playerId);

  // Prompts follow the change whichever way it goes, so undoing a "Yes"
  // asks again and undoing the move that caused a prompt drops it.
  private apply = (next: GameState) => {
    const before = this.state;
    this.state = next;
    this.known = this.lookedAtTop(
      learnFromChange(this.known, before, next, this.playerId)
    );
    this.updateCommanderPrompts(before);
    this.pushViews();
  };

  private undo = () => {
    const undone = undoLast(this.state, this.playerId, this.undoFloor);
    if (!undone) return;
    this.endShowing(false);
    // Told as if the action were applied again to the state without it.
    const redone = reduce(undone.state, undone.action);
    const text = this.describe(undone.state, undone.action, redone);
    this.redoStack.push(undone.action);
    this.apply(undone.state);
    this.addLogEntry(text ? `undid: ${text}` : 'undid an action');
  };

  private redo = () => {
    const action = this.redoStack.pop();
    if (!action) return;
    this.endShowing(false);
    const next = redoAction(this.state, action);
    if (next) {
      const text = this.describe(this.state, action, next);
      this.apply(next);
      this.addLogEntry(text ? `redid: ${text}` : 'redid an action');
    } else {
      this.redoStack = [];
      this.pushUndoState();
    }
  };

  private undoState = (): UndoState => ({
    canUndo: this.state.log.length > this.undoFloor,
    canRedo: this.redoStack.length > 0,
  });

  private pushUndoState = () => {
    const state = this.undoState();
    sendEvent(this.board, 'undoState', state);
    sendEvent(this.hand, 'undoState', state);
  };

  // A prompt lasts until answered or until its commander moves again; a
  // move into another such zone replaces it.
  private updateCommanderPrompts = (before: GameState) => {
    const moves = commanderMoves(before, this.state, this.playerId);
    const moved = new Set(moves.map((move) => move.instanceId));
    const kept = this.commanderPrompts.filter(
      (prompt) =>
        !moved.has(prompt.instanceId) &&
        this.state.cards[prompt.instanceId]?.zone === prompt.zone
    );
    const prompts = [...kept, ...moves];
    const same =
      prompts.length === this.commanderPrompts.length &&
      prompts.every((prompt, i) => prompt === this.commanderPrompts[i]);
    if (same) return;
    this.commanderPrompts = prompts;
    sendEvent(this.board, 'commanderPrompts', prompts);
  };

  // The player's own side of a showing is theirs to see and stop.
  private handView = () => {
    const view = privateView(this.state, this.playerId);
    return (
      view && {
        ...view,
        showing: this.publicShowing(),
        known: knownCards(this.state, this.playerId, this.known),
      }
    );
  };

  private pushViews = () => {
    const hand = this.handView();
    if (hand) {
      sendEvent(this.hand, 'handView', hand);
      if (this.handInBoard) sendEvent(this.board, 'handView', hand);
    }
    this.pushUndoState();
    this.pushBoardView();
  };

  private pushBoardView = () => {
    const board = this.boardView();
    if (board) sendEvent(this.board, 'boardView', board);
    this.notifyPublic();
  };

  private newGame = (deck: LoadedDeck, seed = randomInt(2 ** 32)) => {
    this.settleControl();
    const actions: GameAction[] = [
      {
        type: 'newGame',
        seed,
        players: [
          {
            id: this.playerId,
            name: this.playerName(),
            deck: deck.library,
            command: deck.command,
            companion: deck.companion,
            sideboard: deck.sideboard,
            life: startingLife(deck.format),
          },
        ],
      },
      { type: 'shuffle', playerId: this.playerId },
      { type: 'draw', playerId: this.playerId, count: OPENING_HAND_SIZE },
    ];
    this.deck = deck;
    this.state = actions.reduce(reduce, this.state);
    this.undoFloor = this.state.log.length;
    this.redoStack = [];
    this.commanderPrompts = [];
    this.known = NO_KNOWLEDGE;
    this.forgetSeen();
    this.libraryActivity.reset();
    this.setLookAtTop(false);
    this.endShowing(false);
    sendEvent(this.board, 'commanderPrompts', []);
    sendEvent(this.board, 'gameStarted', null);
    sendEvent(this.hand, 'gameStarted', null);
  };

  private restart = () => {
    if (!this.board && !this.hand) return;
    this.newGame(this.deck);
    this.pushViews();
    this.addLogEntry('restarted the game');
  };

  private status = (): PlayTestStatus => {
    const open = this.isOpen;
    return {
      open,
      deck: open ? this.deckLabel : null,
      sampleDeck: sampleDeckAllowed(),
      handInBoard: open && this.handInBoard,
    };
  };

  // Every window gets it: the app window's lobby and deck screens show it.
  private pushStatus = () => {
    const status = this.status();
    BrowserWindow.getAllWindows().forEach((window) => {
      sendEvent(window, 'playTestStatus', status);
    });
    this.statusListeners.forEach((listener) => listener(status));
  };

  private start = async (
    deck: LoadedDeck,
    seed: number | undefined,
    label: PlayTestStatus['deck']
  ) => {
    const handInBoard = this.handInBoardSetting();
    if (this.isOpen && handInBoard !== this.handInBoard) {
      this.closeForModeChange();
    }
    this.newGame(deck, seed);
    this.deckLabel = label;

    const { board, hand } = this.ensureWindows(handInBoard);
    this.pushStatus();
    this.addLogEntry('started a new game');
    const windows = hand ? [board, hand] : [board];
    const loaded = await Promise.all(windows.map(whenLoaded));
    if (!loaded.every(Boolean)) return;

    // Windows also fetch their view on load; this covers reused windows.
    this.pushViews();
    hand?.show();
    board.show();
    board.focus();
  };

  // A changed mode gets fresh windows. The old ones are forgotten first,
  // so their close handlers can't touch the new ones.
  private closeForModeChange = () => {
    const old = [this.board, this.hand];
    this.board = null;
    this.hand = null;
    old.forEach((window) => window?.close());
  };

  // A reloaded or crashed window has lost any dialog it had open.
  private clearActivityOnReload = (window: BrowserWindow) => {
    window.webContents.on('did-navigate', this.libraryActivity.clear);
    window.webContents.on('render-process-gone', this.libraryActivity.clear);
  };

  // With the hand docked, the board also gets the hand window's height.
  private boardHeight = (handInBoard: boolean) =>
    handInBoard
      ? Math.min(1068, screen.getPrimaryDisplay().workAreaSize.height)
      : 728;

  private ensureWindows = (handInBoard: boolean) => {
    this.handInBoard = handInBoard;

    const board =
      this.board ??
      createWindow({
        html: 'board.html',
        width: 1560,
        height: this.boardHeight(handInBoard),
      });

    const hand = handInBoard
      ? null
      : (this.hand ??
        createWindow({
          html: 'hand.html',
          width: 1280,
          height: 340,
          frame: false,
        }));

    if (!this.board) {
      this.board = board;
      this.clearActivityOnReload(board);
      board.on('closed', () => {
        if (this.board !== board) return;
        this.board = null;
        this.settleControl();
        this.libraryActivity.reset();
        this.forgetReveals();
        this.hand?.close();
        this.notifyPublic();
        this.pushStatus();
      });
    }

    if (hand && !this.hand) {
      this.hand = hand;
      this.clearActivityOnReload(hand);
      hand.on('closed', () => {
        if (this.hand !== hand) return;
        this.hand = null;
        this.settleControl();
        this.libraryActivity.reset();
        this.forgetReveals();
        this.board?.close();
        this.notifyPublic();
        this.pushStatus();
      });
    }

    return { board, hand };
  };
}
