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
  describeStep,
  emptyGame,
  type GameAction,
  type GameState,
  lentCard,
  lentTo,
  libraryView,
  OPENING_HAND_SIZE,
  parseLibraryActivity,
  parsePlayerAction,
  type PlayerAction,
  permanentState,
  type PlayerId,
  privateView,
  publicName,
  publicView,
  type PublicView,
  redoAction,
  reduce,
  startingLife,
  undoLast,
  type UndoState,
} from '@shared/game';
import type { DeckFormat } from '@shared/types/decks';
import type { PlayTestStatus } from '@shared/types/playTest';
import { app, BrowserWindow, screen } from 'electron';

import { type GameMenuCommand, runGameMenuCommand } from '../../gameMenu';
import { type RequestHandlers, type SenderGuards, sendEvent } from '../../ipc';
import type CardDB from '../../shared/db/CardDB';
import type DeckDB from '../../shared/db/DeckDB';
import { createWindow, whenLoaded } from '../../windows';
import { toCardRef } from './cardRef';
import LibraryActivityTracker from './LibraryActivityTracker';
import { mayReadHand, mayReadLibrary } from './privateAccess';
import buildSampleDeck from './sampleDeck';

export interface LoadedDeck {
  library: CardRef[];
  command: CardRef[];
  format: DeckFormat;
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
    return view && { ...view, libraryActivity: this.libraryActivity.current };
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
    getHandView: () => privateView(this.state, this.playerId),
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
  };

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
    setLibraryActivity: (sender) =>
      [this.board, this.hand].some(
        (w) => w !== null && w.webContents === sender
      ),
  };

  // A fixed seed is only passed by end-to-end tests, which may also ask
  // for a Commander game led by one of the sample creatures.
  openSampleDeck = (seed?: number, format: DeckFormat = 'constructed') => {
    const library = buildSampleDeck();
    const leader = library.find((ref) => ref.name === 'Colossal Dreadmaw');
    const command = format === 'commander' && leader ? [leader] : [];
    const label = { id: null, name: 'Sample deck' };
    return this.start({ library, command, format }, seed, label).catch(
      (err) => {
        console.error('[PlayTest] failed to open sample deck', err);
      }
    );
  };

  // The sideboard stays out of the game; commanders start in the
  // command zone.
  private loadDeck = (deckId: number): LoadedDeck => {
    const refs = (board: 'main' | 'commander') =>
      this.deckDb
        .getDeckCards(deckId)
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
    };
  };

  // Windows may only act on the local player's cards; stale actions on
  // cards that no longer exist are dropped the same way.
  private dispatch = (action: PlayerAction) => {
    if (actionPlayer(this.state, action) !== this.playerId) return;
    const next = reduce(this.state, action);
    if (next === this.state) return;
    const left = departures(this.state, action, next);
    if (left.length > 0) {
      this.sendHome(left);
      this.applyControl(next);
      return;
    }
    const text = this.describe(this.state, action, next);
    this.redoStack = [];
    this.apply(next);
    if (text) this.addLogEntry(text);
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

  // A player left or closed their game: everything that changed hands
  // with them comes home, and nothing is sent, since nobody is there.
  peerGone = (playerId: PlayerId, name: string) => {
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
    this.updateCommanderPrompts(before);
    this.pushViews();
  };

  private undo = () => {
    const undone = undoLast(this.state, this.playerId, this.undoFloor);
    if (!undone) return;
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

  private pushViews = () => {
    const hand = privateView(this.state, this.playerId);
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
    this.libraryActivity.reset();
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
        this.board?.close();
        this.notifyPublic();
        this.pushStatus();
      });
    }

    return { board, hand };
  };
}
