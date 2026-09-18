// Pure game-state types. Everything here is plain JSON so a state or view
// can cross IPC, be logged, or be sent to a peer unchanged.

export type PlayerId = string;
export type InstanceId = string;

export const zoneIds = [
  'library',
  'hand',
  'battlefield',
  'graveyard',
  'exile',
  'command',
] as const;

export type ZoneId = (typeof zoneIds)[number];

// Zones whose contents only the owner may know.
export const hiddenZones: readonly ZoneId[] = ['library', 'hand'];

export interface Position {
  x: number;
  y: number;
}

export interface CardFace {
  name: string;
  typeLine: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
}

// Self-describing display data, copied into each instance so a state (or a
// peer receiving it) never needs a card database lookup.
export interface CardRef {
  // Scryfall id of the printing.
  id: string;
  name: string;
  typeLine: string;
  faces: CardFace[];
  power?: string;
  toughness?: string;
  loyalty?: string;
}

export interface CardInstance {
  instanceId: InstanceId;
  ref: CardRef;
  owner: PlayerId;
  controller: PlayerId;
  zone: ZoneId;
  // Only set on the battlefield.
  position: Position | null;
  tapped: boolean;
  faceDown: boolean;
  faceIndex: number;
  counters: Record<string, number>;
  isToken: boolean;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  life: number;
  counters: Record<string, number>;
  // Ordered instance ids per zone. library[0] is the top of the library.
  zones: Record<ZoneId, InstanceId[]>;
}

export interface GameState {
  // Increases with every applied action, across games, so views can be
  // ordered even when a new game replaces the old one.
  seq: number;
  players: PlayerState[];
  cards: Record<InstanceId, CardInstance>;
  // PRNG state; see rng.ts.
  rng: number;
  nextInstanceId: number;
  // Every applied action since the last newGame (which is log[0]), so a
  // game can be replayed deterministically from its seed.
  log: GameAction[];
}

// Actions are declared here so GameState can reference them without an
// import cycle; the reducers live in core.ts and mtg.ts.

export interface PlayerSetup {
  id: PlayerId;
  name: string;
  deck: CardRef[];
  command?: CardRef[];
  life?: number;
}

export interface NewGameAction {
  type: 'newGame';
  seed: number;
  players: PlayerSetup[];
}

export interface ShuffleAction {
  type: 'shuffle';
  playerId: PlayerId;
}

export interface DrawAction {
  type: 'draw';
  playerId: PlayerId;
  count: number;
}

export interface MoveCardAction {
  type: 'moveCard';
  instanceId: InstanceId;
  to: ZoneId;
  // Where in the destination zone's order; defaults to the end. For the
  // library, 0 is the top.
  index?: number;
  // Battlefield placement; defaults to a cascade so cards don't stack.
  position?: Position;
}

export interface SetPositionAction {
  type: 'setPosition';
  instanceId: InstanceId;
  position: Position;
}

export type CoreAction =
  | NewGameAction
  | ShuffleAction
  | DrawAction
  | MoveCardAction
  | SetPositionAction;

export interface TapAction {
  type: 'tap' | 'untap' | 'toggleTap';
  instanceId: InstanceId;
}

export type MtgAction = TapAction;

export type GameAction = CoreAction | MtgAction;

// What a window may ask for. Starting a game is main's decision.
export type PlayerAction = Exclude<GameAction, NewGameAction>;
