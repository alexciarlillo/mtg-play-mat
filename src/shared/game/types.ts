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
  'sideboard',
] as const;

export type ZoneId = (typeof zoneIds)[number];

// Zones whose contents only the owner may know.
export const hiddenZones: readonly ZoneId[] = ['library', 'hand', 'sideboard'];

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
  // Battlefield-only state the player sets by hand; gone when the card
  // leaves. Optional so older states, saves and peers still fit.
  doesntUntap?: true;
  ptOverride?: PtOverride;
  abilities?: string[];
}

// Base power and toughness set by an effect, or given to a permanent
// that becomes a creature. Counters still apply on top.
export interface PtOverride {
  power: number;
  toughness: number;
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
  // Cards found in a search, wherever hidden they went: the hand or
  // either end of the library.
  search?: true;
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
  // Plays with the top card of the library face up for everyone, until
  // turned off. Unlike a reveal, other actions leave it on.
  topRevealed?: boolean;
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
  // Commanders; the companion goes to the command zone after them but
  // is not a commander.
  command?: CardRef[];
  companion?: CardRef[];
  // Outside the game, and as hidden as the hand.
  sideboard?: CardRef[];
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
  // Enters the battlefield tapped; ignored for any other move.
  tapped?: boolean;
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

// Moves several of a player's cards to one zone in one step, each as
// moveCard would. Refused whole unless the player holds every card.
export interface MoveCardsAction {
  type: 'moveCards';
  playerId: PlayerId;
  instanceIds: InstanceId[];
  to: ZoneId;
  // As for moveCard; the cards go in from there in the order given, so
  // index 0 of the library puts the first one topmost.
  index?: number;
  tapped?: boolean;
}

// Card types to match on a type line, such as Creature or Land, in any
// case. A card matches if it has any of types and none of excludeTypes.
export interface CardTypeFilter {
  types?: string[];
  excludeTypes?: string[];
}

// Moves every card in one of a player's zones, or those matching filter,
// to another. The cards are picked when it applies, so undo replays it.
export interface MoveAllAction {
  type: 'moveAll';
  playerId: PlayerId;
  from: ZoneId;
  to: ZoneId;
  filter?: CardTypeFilter;
}

// Taps or untaps several of a player's permanents in one step.
export interface SetTappedAction {
  type: 'setTapped';
  playerId: PlayerId;
  instanceIds: InstanceId[];
  tapped: boolean;
}

// Moves several of a player's permanents on the battlefield in one step,
// as a group drag does. A card whose host is in the group follows it.
export interface SetPositionsAction {
  type: 'setPositions';
  playerId: PlayerId;
  positions: { instanceId: InstanceId; position: Position }[];
}

export type BatchAction =
  MoveCardsAction | MoveAllAction | SetTappedAction | SetPositionsAction;

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
  // The face to show, e.g. The Initiative rather than the Undercity on
  // its front. Optional so older saves stay valid.
  faceIndex?: number;
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

// Puts the top count cards of the library into the graveyard, or into
// exile instead.
export interface MillAction {
  type: 'mill';
  playerId: PlayerId;
  count: number;
  to?: 'graveyard' | 'exile';
}

// Applies a look at the top of the library (scry, surveil, and the like)
// in one step. The lists together must be exactly the top cards;
// top and bottom keep the order given, first nearest the top.
export interface ArrangeTopAction {
  type: 'arrangeTop';
  playerId: PlayerId;
  top: InstanceId[];
  bottom: InstanceId[];
  graveyard: InstanceId[];
  exile: InstanceId[];
  hand: InstanceId[];
  // Optional, unlike the others, since only a reveal-until uses it.
  battlefield?: InstanceId[];
  // Shuffles the bottom cards among themselves instead of keeping order.
  bottomRandom?: boolean;
  // Shuffles the whole library once the cards are placed (Ponder).
  shuffleAfter?: boolean;
}

export type SearchDestination =
  'hand' | 'battlefield' | 'graveyard' | 'exile' | 'top' | 'bottom';

export interface SearchPick {
  instanceId: InstanceId;
  to: SearchDestination;
  // Only meaningful for the battlefield.
  tapped?: boolean;
}

// Takes the picked cards out of the library, optionally shuffles, then
// puts each where it goes. Top picks go on in pick order, the first one
// topmost; bottom picks go under the rest, the last one lowest.
export interface SearchLibraryAction {
  type: 'searchLibrary';
  playerId: PlayerId;
  picks: SearchPick[];
  shuffle: boolean;
  // Shows everyone the picks that end up hidden (hand or library), as a
  // reveal that lasts until the player's next action.
  reveal?: boolean;
}

// Puts hand cards into the library in one step. Top cards go on in the
// order given, the first topmost; bottom cards go under the rest, the
// last one lowest.
export interface PutFromHandAction {
  type: 'putFromHand';
  playerId: PlayerId;
  top: InstanceId[];
  bottom: InstanceId[];
}

// Shows the whole hand, the top count library cards, or one card: from
// the hand, or one of the owner's own face-down permanents.
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

export interface SetTopRevealedAction {
  type: 'setTopRevealed';
  playerId: PlayerId;
  revealed: boolean;
}

// Starts the player's next turn, optionally untapping and drawing.
export interface NextTurnAction {
  type: 'nextTurn';
  playerId: PlayerId;
  untap: boolean;
  draw: boolean;
  // Also empties the mana pool; optional so older saves stay valid.
  emptyMana?: boolean;
}

export interface SetPhaseAction {
  type: 'setPhase';
  playerId: PlayerId;
  phase: Phase;
  emptyMana?: boolean;
}

export type LibraryAction =
  | MillAction
  | ArrangeTopAction
  | SearchLibraryAction
  | PutFromHandAction
  | RevealAction
  | HideRevealAction
  | SetTopRevealedAction
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

// Changes the hand-set state of several of a player's permanents in one
// step; each field left out is left alone. Refused whole unless every
// card is on the player's battlefield.
export interface SetCardStateAction {
  type: 'setCardState';
  playerId: PlayerId;
  instanceIds: InstanceId[];
  doesntUntap?: boolean;
  // null goes back to the printed power and toughness.
  ptOverride?: PtOverride | null;
  addAbilities?: string[];
  removeAbilities?: string[];
}

// Sets every mana counter of the player's pool to zero.
export interface EmptyManaPoolAction {
  type: 'emptyManaPool';
  playerId: PlayerId;
}

export type CardStateAction = SetCardStateAction | EmptyManaPoolAction;

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

// A permanent's state as it crosses from one player's game to another's.
export interface PermanentState {
  tapped: boolean;
  faceDown: boolean;
  faceIndex: number;
  counters: Record<string, number>;
  commanderCasts?: number;
  doesntUntap?: true;
  ptOverride?: PtOverride;
  abilities?: string[];
}

// Everything another game needs to put a lent permanent on its board.
export interface LentCard extends PermanentState {
  instanceId: InstanceId;
  ref: CardRef;
  isToken: boolean;
  isCommander?: boolean;
}

// The owner lets another player control one of their permanents. The
// card stays in the owner's game, set aside, until it comes back.
export interface GiveControlAction {
  type: 'giveControl';
  instanceId: InstanceId;
  to: PlayerId;
}

// Another player's permanent comes under this player's control.
export interface GainControlAction {
  type: 'gainControl';
  playerId: PlayerId;
  owner: PlayerId;
  card: LentCard;
}

// Borrowed permanents leave this game, back to their owner's.
export interface ReleaseControlAction {
  type: 'releaseControl';
  instanceIds: InstanceId[];
}

// A lent permanent comes back to its owner, into the zone the player who
// controlled it sent it to; state only matters for the battlefield.
export interface RegainControlAction {
  type: 'regainControl';
  instanceId: InstanceId;
  to: ZoneId;
  // As for moveCard; shuffle is for a shuffle into the library.
  index?: number;
  shuffle?: boolean;
  state: PermanentState;
}

// Applied by main as other players act, never asked for by a window.
export type ControlAction =
  | GiveControlAction
  | GainControlAction
  | ReleaseControlAction
  | RegainControlAction;

export type GameAction =
  | CoreAction
  | BatchAction
  | MtgAction
  | CardStateAction
  | CommanderAction
  | LibraryAction
  | ControlAction;

// What a window may ask for. Starting a game is main's decision, and so
// is every change of control, since each one crosses to another game.
export type PlayerAction = Exclude<GameAction, NewGameAction | ControlAction>;
