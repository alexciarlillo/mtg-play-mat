import type {
  CardView,
  CommanderMove,
  PlayerAction,
  PrivateView,
  PublicView,
  UndoState,
} from '../game';
import type { NetCommand, NetReport, NetState } from '../net/lobby';
import type { RollRequest } from '../net/protocol';
import type { OpponentState } from '../net/remoteViews';
import type { Settings, SettingsPatch } from '../settings';
import type { CardDataStatus } from '../types/cardData';
import type {
  AppRoute,
  BoardMenuCommand,
  PlayTestStatus,
} from '../types/playTest';
import type {
  CurrentSetListReturn,
  SearchCardsByNameOptions,
  SearchCardsByNameRet,
  TokenSearchResult,
} from '../types/cards';
import type {
  CardNameResult,
  DeckCardEdit,
  DeckDetail,
  DeckImportReport,
  DeckPatch,
  DeckSummary,
  NewDeck,
  PrintingSummary,
} from '../types/decks';

// Only the keys exist at runtime (preload and main iterate them); the
// generic parameters carry the argument, result, and payload types.
interface Spec<T> {
  readonly type?: T;
}

const request = <Args extends unknown[] = [], Result = void>(): Spec<
  (...args: Args) => Result
> => ({});

const event = <Payload>(): Spec<Payload> => ({});

// Renderer -> main, via invoke/handle.
export const requests = {
  listDecks: request<[], DeckSummary[]>(),
  // Parses and resolves a pasted list without saving anything.
  previewDeckImport: request<[deckList: string], DeckImportReport>(),
  // Resolves to the new deck's id.
  createDeck: request<[deck: NewDeck], number>(),
  getDeck: request<[id: number], DeckDetail | null>(),
  updateDeck: request<[id: number, patch: DeckPatch], DeckDetail | null>(),
  editDeckCards: request<[id: number, edit: DeckCardEdit], DeckDetail | null>(),
  deleteDeck: request<[id: number], DeckSummary[]>(),
  searchCardNames: request<[query: string], CardNameResult[]>(),
  // Every printing of the same card as the given printing.
  listPrintings: request<[printingId: string], PrintingSummary[]>(),
  searchCards: request<
    [options: SearchCardsByNameOptions],
    SearchCardsByNameRet[]
  >(),
  listSets: request<[], CurrentSetListReturn[]>(),
  startPlayTest: request<[deckId: number]>(),
  // A new game with the same deck and a fresh seed.
  restartPlayTest: request<[]>(),
  // Lets the app window start, show, and end a game on its own.
  getPlayTestStatus: request<[], PlayTestStatus>(),
  startSamplePlayTest: request<[]>(),
  closePlayTest: request<[]>(),
  // Main validates the action and pushes fresh views to both windows.
  dispatch: request<[action: PlayerAction]>(),
  // Board and hand fetch their view on load, so a reload restores it.
  getBoardView: request<[], PublicView | null>(),
  getHandView: request<[], PrivateView | null>(),
  // Commanders waiting for their owner to choose whether they return to
  // the command zone; answering yes is a moveCard dispatch.
  getCommanderPrompts: request<[], CommanderMove[]>(),
  dismissCommanderPrompt: request<[instanceId: string]>(),
  // Takes back or re-applies the local player's latest action.
  undo: request<[]>(),
  redo: request<[]>(),
  getUndoState: request<[], UndoState>(),
  // The library, top first. Only the private hand window may ask.
  getLibrary: request<[], CardView[]>(),
  getCardDataStatus: request<[], CardDataStatus>(),
  // Starts a check-and-download; progress arrives as cardDataStatus.
  updateCardData: request<[], CardDataStatus>(),
  // Lobby actions; results and errors arrive as netState.
  getNetState: request<[], NetState>(),
  netHost: request<[]>(),
  // Host: a new invite for an empty guest seat.
  netInvite: request<[seat: number]>(),
  netAcceptReply: request<[seat: number, code: string]>(),
  // Host: removes the player (or pending invite) from a seat.
  netCloseSeat: request<[seat: number]>(),
  netJoin: request<[code: string]>(),
  netLeave: request<[]>(),
  netResend: request<[]>(),
  // The host rolls; the result shows up in the table log.
  netRoll: request<[request: RollRequest]>(),
  // Only the hidden net window may call this.
  netReport: request<[report: NetReport]>(),
  getOpponentView: request<[], OpponentState>(),
  // Token printings by name, for creating tokens in a play test.
  searchTokens: request<[query: string], TokenSearchResult[]>(),
  // App preferences. Main drops invalid keys and values from a patch, and
  // every window hears about the change as settingsChanged.
  getSettings: request<[], Settings>(),
  updateSettings: request<[patch: SettingsPatch], Settings>(),
};

// Main -> renderer pushes. The preload exposes each as on<Name>(listener).
export const events = {
  boardView: event<PublicView>(),
  handView: event<PrivateView>(),
  cardDataStatus: event<CardDataStatus>(),
  netState: event<NetState>(),
  netCommand: event<NetCommand>(),
  opponentView: event<OpponentState>(),
  commanderPrompts: event<CommanderMove[]>(),
  undoState: event<UndoState>(),
  settingsChanged: event<Settings>(),
  playTestStatus: event<PlayTestStatus>(),
  // From the Game menu, to the board window.
  boardMenuCommand: event<BoardMenuCommand>(),
  // To the app window.
  navigate: event<AppRoute>(),
};

type SpecType<S> = S extends Spec<infer T> ? T : never;
type RequestFn<C extends RequestChannel> = SpecType<(typeof requests)[C]>;

export type RequestChannel = keyof typeof requests;
export type RequestArgs<C extends RequestChannel> = Parameters<RequestFn<C>>;
export type RequestResult<C extends RequestChannel> = ReturnType<RequestFn<C>>;

export type EventChannel = keyof typeof events;
export type EventPayload<C extends EventChannel> = SpecType<(typeof events)[C]>;

export type EventListenerName<C extends EventChannel> = `on${Capitalize<C>}`;

export const eventListenerName = <C extends EventChannel>(
  channel: C
): EventListenerName<C> =>
  `on${channel.charAt(0).toUpperCase()}${channel.slice(1)}` as EventListenerName<C>;

export const requestChannels = Object.keys(requests) as RequestChannel[];
export const eventChannels = Object.keys(events) as EventChannel[];

// The whole surface the preload exposes as window.api.
export type Api = {
  [C in RequestChannel]: (...args: RequestArgs<C>) => Promise<RequestResult<C>>;
} & {
  [C in EventChannel as EventListenerName<C>]: (
    listener: (payload: EventPayload<C>) => void
  ) => () => void;
};
