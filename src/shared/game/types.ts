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
  // Scryfall id of the printing; empty for a custom token.
  id: string;
  name: string;
  typeLine: string;
  faces: CardFace[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  // Scryfall layout (e.g. transform, modal_dfc, flip), when known.
  layout?: string;
  // A user-made token with no printing, so no image to show.
  custom?: true;
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
  // Commander identity survives every zone change, unlike other state.
  isCommander?: boolean;
  // Casts from the command zone; the commander tax is 2 per cast.
  commanderCasts?: number;
  // The permanent this aura or equipment is attached to.
  attachedTo: InstanceId | null;
}

export const phases = [
  'untap',
  'upkeep',
  'draw',
  'main1',
  'combat',
  'main2',
  'end',
] as const;

export type Phase = (typeof phases)[number];

export type RevealSource = 'hand' | 'libraryTop' | 'card';

// Hidden cards the player has shown everyone, until they hide them or
// take any other action.
export interface Reveal {
  source: RevealSource;
  instanceIds: InstanceId[];
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  life: number;
  counters: Record<string, number>;
  // London mulligan: how many times this hand was mulliganed, and whether
  // the opening hand has been kept (which ends mulligans).
  mulligans: number;
  keptHand: boolean;
  // Ordered instance ids per zone. library[0] is the top of the library.
  zones: Record<ZoneId, InstanceId[]>;
  // Commander damage this player has taken, one entry per source.
  commanderDamage?: CommanderDamage[];
  // Stand-in opponents for solo play, tracked by this player.
  dummies?: DummyOpponent[];
  // This player's own turn count and step; both public.
  turn: number;
  phase: Phase;
  revealed?: Reveal;
}

export interface CommanderDamage {
  // Opaque key of the dealing commander, e.g. a (namespaced) instance id.
  source: string;
  // Display name of the source, so any viewer can label it.
  name: string;
  damage: number;
}

export interface DummyOpponent {
  id: string;
  name: string;
  life: number;
  commanderDamage: CommanderDamage[];
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
  // How a card enters the battlefield: face down (morph, manifest), or on
  // another face (the back of a modal double-faced card).
  faceDown?: boolean;
  faceIndex?: number;
}

export interface SetPositionAction {
  type: 'setPosition';
  instanceId: InstanceId;
  position: Position;
}

// Puts a card into its owner's library, then shuffles it.
export interface ShuffleIntoLibraryAction {
  type: 'shuffleIntoLibrary';
  instanceId: InstanceId;
}

export type CoreAction =
  | NewGameAction
  | ShuffleAction
  | DrawAction
  | MoveCardAction
  | SetPositionAction
  | ShuffleIntoLibraryAction;

export interface TapAction {
  type: 'tap' | 'untap' | 'toggleTap';
  instanceId: InstanceId;
}

export interface UntapAllAction {
  type: 'untapAll';
  playerId: PlayerId;
}

export interface AdjustLifeAction {
  type: 'adjustLife';
  playerId: PlayerId;
  delta: number;
}

export interface SetLifeAction {
  type: 'setLife';
  playerId: PlayerId;
  life: number;
}

// Shuffles the hand into the library and draws a new hand of seven.
export interface MulliganAction {
  type: 'mulligan';
  playerId: PlayerId;
}

// Keeps the hand, putting one card per mulligan on the library bottom in
// the order given.
export interface KeepHandAction {
  type: 'keepHand';
  playerId: PlayerId;
  bottom: InstanceId[];
}

// Adds (or with a negative delta, removes) counters on a card.
export interface AdjustCounterAction {
  type: 'adjustCounter';
  instanceId: InstanceId;
  counter: string;
  delta: number;
}

// Poison, energy, experience, and other counters on a player.
export interface AdjustPlayerCounterAction {
  type: 'adjustPlayerCounter';
  playerId: PlayerId;
  counter: string;
  delta: number;
}

// Puts count new tokens onto the player's battlefield.
export interface CreateTokensAction {
  type: 'createTokens';
  playerId: PlayerId;
  ref: CardRef;
  count: number;
}

// Creates a token that copies a permanent.
export interface CopyCardAction {
  type: 'copyCard';
  instanceId: InstanceId;
}

export interface SetFaceDownAction {
  type: 'setFaceDown';
  instanceId: InstanceId;
  faceDown: boolean;
}

// Turns a multi-face permanent to its next face.
export interface TransformAction {
  type: 'transform';
  instanceId: InstanceId;
}

// Attaches a permanent to another, or detaches it when to is null.
export interface AttachAction {
  type: 'attach';
  instanceId: InstanceId;
  to: InstanceId | null;
}

// Puts the top count cards of the library into the graveyard.
export interface MillAction {
  type: 'mill';
  playerId: PlayerId;
  count: number;
}

// Applies a look at the top of the library (scry, surveil, and the like)
// in one step. The four lists together must be exactly the top cards;
// top and bottom keep the order given, first nearest the top.
export interface ArrangeTopAction {
  type: 'arrangeTop';
  playerId: PlayerId;
  top: InstanceId[];
  bottom: InstanceId[];
  graveyard: InstanceId[];
  hand: InstanceId[];
}

export type SearchDestination =
  'hand' | 'battlefield' | 'graveyard' | 'exile' | 'library';

// Takes cards out of the library, optionally shuffles, then puts them in
// place; 'library' means the top, after the shuffle.
export interface SearchLibraryAction {
  type: 'searchLibrary';
  playerId: PlayerId;
  instanceIds: InstanceId[];
  to: SearchDestination;
  shuffle: boolean;
}

// Shows the whole hand, the top count library cards, or one hand card.
export type RevealAction = {
  type: 'reveal';
  playerId: PlayerId;
} & (
  | { source: 'hand' }
  | { source: 'libraryTop'; count: number }
  | { source: 'card'; instanceId: InstanceId }
);

export interface HideRevealAction {
  type: 'hideReveal';
  playerId: PlayerId;
}

// Starts the player's next turn, optionally untapping and drawing.
export interface NextTurnAction {
  type: 'nextTurn';
  playerId: PlayerId;
  untap: boolean;
  draw: boolean;
}

export interface SetPhaseAction {
  type: 'setPhase';
  playerId: PlayerId;
  phase: Phase;
}

export type LibraryAction =
  | MillAction
  | ArrangeTopAction
  | SearchLibraryAction
  | RevealAction
  | HideRevealAction
  | NextTurnAction
  | SetPhaseAction;

export type MtgCardAction =
  | TapAction
  | AdjustCounterAction
  | CopyCardAction
  | SetFaceDownAction
  | TransformAction
  | AttachAction;

export type MtgPlayerAction =
  | UntapAllAction
  | AdjustLifeAction
  | SetLifeAction
  | MulliganAction
  | KeepHandAction
  | AdjustPlayerCounterAction
  | CreateTokensAction;

export type MtgAction = MtgCardAction | MtgPlayerAction;

// Commander tax: changes a commander's cast count by delta (not below 0).
export interface AdjustCommanderCastsAction {
  type: 'adjustCommanderCasts';
  instanceId: InstanceId;
  delta: number;
}

// Changes the commander damage a player (or one of their dummies) has
// taken from one source; life moves by the same amount the other way.
export interface AdjustCommanderDamageAction {
  type: 'adjustCommanderDamage';
  playerId: PlayerId;
  dummyId?: string;
  source: string;
  sourceName: string;
  delta: number;
}

export interface AddDummyAction {
  type: 'addDummy';
  playerId: PlayerId;
  name: string;
}

export interface RemoveDummyAction {
  type: 'removeDummy';
  playerId: PlayerId;
  dummyId: string;
}

export interface AdjustDummyLifeAction {
  type: 'adjustDummyLife';
  playerId: PlayerId;
  dummyId: string;
  delta: number;
}

export type CommanderAction =
  | AdjustCommanderCastsAction
  | AdjustCommanderDamageAction
  | AddDummyAction
  | RemoveDummyAction
  | AdjustDummyLifeAction;

export type GameAction =
  CoreAction | MtgAction | CommanderAction | LibraryAction;

// What a window may ask for. Starting a game is main's decision.
export type PlayerAction = Exclude<GameAction, NewGameAction>;
