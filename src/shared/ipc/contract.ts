import type { CardModelProps } from '../models/CardModel';
import type {
  CurrentSetListReturn,
  DeckRow,
  SearchCardsByNameOptions,
  SearchCardsByNameRet,
} from '../types/cards';

// Only the keys exist at runtime (preload and main iterate them); the
// generic parameters carry the argument, result, and payload types.
interface Spec<T> {
  readonly type?: T;
}

const request = <Args extends unknown[] = [], Result = void>(): Spec<
  (...args: Args) => Result
> => ({});

const event = <Payload>(): Spec<Payload> => ({});

export interface ImportDeckArgs {
  name: string;
  deckList: string;
}

// Renderer -> main, via invoke/handle.
export const requests = {
  listDecks: request<[], DeckRow[]>(),
  importDeck: request<[deck: ImportDeckArgs], DeckRow[]>(),
  deleteDeck: request<[id: number], DeckRow[]>(),
  searchCards: request<
    [options: SearchCardsByNameOptions],
    SearchCardsByNameRet[]
  >(),
  listSets: request<[], CurrentSetListReturn[]>(),
  startPlayTest: request<[deckId: number]>(),
  drawCard: request<[card: CardModelProps]>(),
  playCard: request<[card: CardModelProps]>(),
};

// Main -> renderer pushes. The preload exposes each as on<Name>(listener).
export const events = {
  deckLoaded: event<CardModelProps[]>(),
  cardDrawn: event<CardModelProps>(),
  cardPlayed: event<CardModelProps>(),
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
