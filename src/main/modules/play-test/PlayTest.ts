import { randomInt } from 'node:crypto';

import {
  actionPlayer,
  type CardRef,
  type CommanderMove,
  commanderMoves,
  describeStep,
  emptyGame,
  type GameAction,
  type GameState,
  libraryView,
  OPENING_HAND_SIZE,
  parsePlayerAction,
  type PlayerAction,
  type PlayerId,
  privateView,
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
import { app, BrowserWindow } from 'electron';

import { type GameMenuCommand, runGameMenuCommand } from '../../gameMenu';
import { type RequestHandlers, type SenderGuards, sendEvent } from '../../ipc';
import type CardDB from '../../shared/db/CardDB';
import type DeckDB from '../../shared/db/DeckDB';
import { createWindow, whenLoaded } from '../../windows';
import { toCardRef } from './cardRef';
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
}

type PublicListener = (view: PublicView | null) => void;

type StatusListener = (status: PlayTestStatus) => void;

type LogListener = (text: string) => void;

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
>;

// The sample deck is a development aid, like the menu item that opens it.
const sampleDeckAllowed = () =>
  !app.isPackaged || process.env.DEBUG_PROD === 'true';

// Owns the authoritative game state and the board and hand windows, which
// only render views of it. The windows exist only while a play test is
// open, and closing either one ends the play test by closing both.
export default class PlayTest {
  private readonly cardDb: CardDB;

  private readonly deckDb: DeckDB;

  private board: BrowserWindow | null = null;

  private hand: BrowserWindow | null = null;

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

  private readonly playerId: PlayerId;

  private readonly playerName: () => string;

  private readonly publicListeners = new Set<PublicListener>();

  private readonly statusListeners = new Set<StatusListener>();

  private readonly logListeners = new Set<LogListener>();

  constructor({ cardDb, deckDb, playerId, playerName }: Deps) {
    this.cardDb = cardDb;
    this.deckDb = deckDb;
    this.playerId = playerId;
    this.playerName = playerName;
  }

  get gameState(): GameState {
    return this.state;
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
    this.isOpen ? publicView(this.state, this.playerId) : null;

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
    getBoardView: () => publicView(this.state, this.playerId),
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
  };

  // The board is shown to others, so only the hand window sees the library.
  readonly guards: SenderGuards = {
    getLibrary: (sender) =>
      this.hand !== null && this.hand.webContents === sender,
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
    const text = this.describe(this.state, action, next);
    this.redoStack = [];
    this.apply(next);
    if (text) this.addLogEntry(text);
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
    const board = publicView(this.state, this.playerId);
    const hand = privateView(this.state, this.playerId);
    if (board) sendEvent(this.board, 'boardView', board);
    if (hand) sendEvent(this.hand, 'handView', hand);
    this.pushUndoState();
    this.notifyPublic();
  };

  private newGame = (deck: LoadedDeck, seed = randomInt(2 ** 32)) => {
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
    sendEvent(this.board, 'commanderPrompts', []);
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
    this.newGame(deck, seed);
    this.deckLabel = label;

    const { board, hand } = this.ensureWindows();
    this.pushStatus();
    this.addLogEntry('started a new game');
    const loaded = await Promise.all([whenLoaded(board), whenLoaded(hand)]);
    if (!loaded.every(Boolean)) return;

    // Windows also fetch their view on load; this covers reused windows.
    this.pushViews();
    hand.show();
    board.show();
    board.focus();
  };

  private ensureWindows = () => {
    const board =
      this.board ??
      createWindow({
        html: 'board.html',
        width: 1560,
        height: 728,
      });

    const hand =
      this.hand ??
      createWindow({
        html: 'hand.html',
        width: 1280,
        height: 340,
        frame: false,
      });

    if (!this.board) {
      this.board = board;
      board.on('closed', () => {
        this.board = null;
        this.hand?.close();
        this.notifyPublic();
        this.pushStatus();
      });
    }

    if (!this.hand) {
      this.hand = hand;
      hand.on('closed', () => {
        this.hand = null;
        this.board?.close();
        this.notifyPublic();
        this.pushStatus();
      });
    }

    return { board, hand };
  };
}
