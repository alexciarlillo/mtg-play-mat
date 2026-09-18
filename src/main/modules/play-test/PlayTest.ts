import { randomInt } from 'node:crypto';

import {
  actionPlayer,
  type CardRef,
  type CommanderMove,
  commanderMoves,
  emptyGame,
  type GameAction,
  type GameState,
  OPENING_HAND_SIZE,
  parsePlayerAction,
  type PlayerAction,
  type PlayerId,
  privateView,
  publicView,
  type PublicView,
  reduce,
  startingLife,
} from '@shared/game';
import type { DeckFormat } from '@shared/types/decks';
import { BrowserWindow } from 'electron';

import { type RequestHandlers, sendEvent } from '../../ipc';
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

type PlayTestHandlers = Pick<
  RequestHandlers,
  | 'startPlayTest'
  | 'restartPlayTest'
  | 'dispatch'
  | 'getBoardView'
  | 'getHandView'
  | 'getCommanderPrompts'
  | 'dismissCommanderPrompt'
>;

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

  // The owner decides whether a commander that left for one of these
  // zones goes to the command zone instead. This is a rules prompt, not
  // game state, so it lives here rather than in the engine.
  private commanderPrompts: CommanderMove[] = [];

  private readonly playerId: PlayerId;

  private readonly playerName: () => string;

  private readonly publicListeners = new Set<PublicListener>();

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

  // What peers may see: the public view while a play test is open.
  currentPublicView = (): PublicView | null =>
    this.board || this.hand ? publicView(this.state, this.playerId) : null;

  onPublicChange = (listener: PublicListener) => {
    this.publicListeners.add(listener);
    return () => {
      this.publicListeners.delete(listener);
    };
  };

  private notifyPublic = () => {
    const view = this.currentPublicView();
    this.publicListeners.forEach((listener) => listener(view));
  };

  readonly handlers: PlayTestHandlers = {
    startPlayTest: (deckId) => this.start(this.loadDeck(deckId)),
    restartPlayTest: () => this.restart(),
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
  };

  // A fixed seed is only passed by end-to-end tests, which may also ask
  // for a Commander game led by one of the sample creatures.
  openSampleDeck = (seed?: number, format: DeckFormat = 'constructed') => {
    const library = buildSampleDeck();
    const leader = library.find((ref) => ref.name === 'Colossal Dreadmaw');
    const command = format === 'commander' && leader ? [leader] : [];
    return this.start({ library, command, format }, seed).catch((err) => {
      console.error('[PlayTest] failed to open sample deck', err);
    });
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
    const before = this.state;
    this.state = next;
    this.updateCommanderPrompts(before);
    this.pushViews();
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
    this.commanderPrompts = [];
    sendEvent(this.board, 'commanderPrompts', []);
  };

  private restart = () => {
    if (!this.board && !this.hand) return;
    this.newGame(this.deck);
    this.pushViews();
  };

  private start = async (deck: LoadedDeck, seed?: number) => {
    this.newGame(deck, seed);

    const { board, hand } = this.ensureWindows();
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
      });
    }

    if (!this.hand) {
      this.hand = hand;
      hand.on('closed', () => {
        this.hand = null;
        this.board?.close();
        this.notifyPublic();
      });
    }

    return { board, hand };
  };
}
