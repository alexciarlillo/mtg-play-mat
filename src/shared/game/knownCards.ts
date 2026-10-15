import { getPlayer } from './core';
import type {
  CardRef,
  GameAction,
  GameState,
  InstanceId,
  PlayerId,
} from './types';

// What the player knows of one position in their own library: nothing,
// or the cards it may hold, sorted. One card is an exact position; more
// are a block put there in a random order, one card per position.
export type Slot = readonly InstanceId[] | null;

// The player's own knowledge of their library, one slot per position,
// top first. past keeps it at every log length, so an undo restores
// what the player knew then rather than reading the rebuilt game.
export interface KnownLedger {
  readonly slots: readonly Slot[];
  readonly past: readonly (readonly Slot[] | undefined)[];
}

export const NO_KNOWLEDGE: KnownLedger = { slots: [], past: [] };

export interface KnownCard {
  instanceId: InstanceId;
  ref: CardRef;
  // One of a block whose order the player doesn't know; such a block is
  // listed by name, never in its real order.
  random?: true;
}

// The known cards at either end of the library. bottom ends with the
// very bottom card; a library known all the way down is all in top.
export interface KnownCards {
  top: KnownCard[];
  bottom: KnownCard[];
}

const libraryOf = (state: GameState, playerId: PlayerId): InstanceId[] =>
  getPlayer(state, playerId)?.zones.library ?? [];

const unknown = (n: number): Slot[] => Array.from({ length: n }, () => null);

// A ledger that doesn't fit the library (a new game) knows nothing.
const slotsFor = (ledger: KnownLedger, length: number): Slot[] =>
  ledger.slots.length === length ? [...ledger.slots] : unknown(length);

const sameSlot = (a: Slot, b: Slot) =>
  a === b || (!!a && !!b && a.join('\u0000') === b.join('\u0000'));

const exact = (id: InstanceId): Slot => [id];

// Takes ids out of every random block, as they are now known elsewhere.
const forget = (slots: Slot[], ids: ReadonlySet<InstanceId>): Slot[] =>
  slots.map((slot) =>
    slot && slot.length > 1 && slot.some((id) => ids.has(id))
      ? slot.filter((id) => !ids.has(id))
      : slot
  );

// The positions of the random block holding id, or none.
const blockOf = (slots: Slot[], id: InstanceId): number[] => {
  const at = slots.findIndex(
    (s) => s !== null && s.length > 1 && s.includes(id)
  );
  if (at < 0) return [];
  const block = slots[at];
  return slots.flatMap((s, i) => (sameSlot(s, block) ? [i] : []));
};

// The player sees which card is at position i.
const identify = (slots: Slot[], i: number, id: InstanceId): Slot[] => {
  const slot = slots[i];
  if (slot?.length === 1 && slot[0] === id) return slots;
  const next =
    slot && slot.length > 1 ? forget(slots, new Set([id])) : [...slots];
  next[i] = exact(id);
  return next;
};

// The maximal run of known positions around i.
const segmentAround = (slots: Slot[], i: number): [number, number] => {
  let start = i;
  while (start > 0 && slots[start - 1]) start -= 1;
  let end = i + 1;
  while (end < slots.length && slots[end]) end += 1;
  return [start, end];
};

// A card left from a position the player doesn't know. Cards above it
// keep their place from the top, cards below from the bottom, so only
// the unbroken known runs at either end survive.
const removeUnknown = (slots: Slot[]): Slot[] => {
  let top = 0;
  while (top < slots.length && slots[top]) top += 1;
  let bottom = slots.length;
  while (bottom > top && slots[bottom - 1]) bottom -= 1;
  if (top === bottom) return unknown(slots.length - 1);
  return [
    ...slots.slice(0, top),
    ...unknown(bottom - top - 1),
    ...slots.slice(bottom),
  ];
};

// A card left the library from wherever it was.
const removeCard = (slots: Slot[], id: InstanceId): Slot[] => {
  const at = slots.findIndex((s) => s?.length === 1 && s[0] === id);
  if (at >= 0) return [...slots.slice(0, at), ...slots.slice(at + 1)];
  const block = blockOf(slots, id);
  if (block.length === 0) return removeUnknown(slots);
  const contiguous = block.at(-1)! - block[0] === block.length - 1;
  if (contiguous) {
    const rest = forget(slots, new Set([id]));
    return [...rest.slice(0, block[0]), ...rest.slice(block[0] + 1)];
  }
  // Known cards inside the block move by one or not, depending on the
  // order the player never saw, so the whole stretch is forgotten.
  const [start, end] = segmentAround(slots, block[0]);
  const blurred = [
    ...slots.slice(0, start),
    ...unknown(end - start),
    ...slots.slice(end),
  ];
  return removeUnknown(blurred);
};

// Whether the action leaves the player's library in an order they can't
// know, which wipes whatever they knew of it.
const shufflesLibrary = (
  before: GameState,
  action: GameAction,
  playerId: PlayerId
): boolean => {
  switch (action.type) {
    case 'newGame':
      return true;
    case 'shuffle':
    case 'mulligan':
      return action.playerId === playerId;
    case 'searchLibrary':
      return action.playerId === playerId && action.shuffle;
    case 'arrangeTop':
      return action.playerId === playerId && action.shuffleAfter === true;
    case 'shuffleIntoLibrary':
      return before.cards[action.instanceId]?.owner === playerId;
    case 'regainControl':
      return action.to === 'library' && action.shuffle === true;
    default:
      return false;
  }
};

// Actions that only ever take cards from the top, so the player knows
// exactly which positions went.
const takesFromTop = new Set<GameAction['type']>([
  'draw',
  'mill',
  'nextTurn',
  'arrangeTop',
  'moveAll',
]);

// Library cards the action picks up and puts back where the player
// chose; they leave their old place and enter a new one.
const replaced = (action: GameAction, playerId: PlayerId): InstanceId[] => {
  switch (action.type) {
    case 'arrangeTop':
      return action.playerId === playerId
        ? [...action.top, ...action.bottom]
        : [];
    case 'searchLibrary':
      return action.playerId === playerId
        ? action.picks
            .filter((pick) => pick.to === 'top' || pick.to === 'bottom')
            .map((pick) => pick.instanceId)
        : [];
    case 'moveCard':
      return action.to === 'library' ? [action.instanceId] : [];
    case 'moveCards':
      return action.to === 'library' ? action.instanceIds : [];
    default:
      return [];
  }
};

// What a card entering the library at a chosen place is known as: the
// cards of a random bottom share one slot of candidates.
const entering = (action: GameAction, id: InstanceId): Slot => {
  if (
    action.type === 'arrangeTop' &&
    action.bottomRandom &&
    action.bottom.length > 1 &&
    action.bottom.includes(id)
  ) {
    return [...action.bottom].sort();
  }
  return exact(id);
};

// Cards shown face up to everyone while in the library: a reveal from
// the top, or the top card played revealed.
const shownInLibrary = (
  slots: Slot[],
  state: GameState,
  playerId: PlayerId
): Slot[] => {
  const player = getPlayer(state, playerId);
  if (!player) return slots;
  const library = player.zones.library;
  const { revealed, topRevealed } = player;
  const shown = [
    ...(revealed?.source === 'libraryTop' ? revealed.instanceIds : []),
    ...(topRevealed && library.length > 0 ? [library[0]] : []),
  ];
  return shown.reduce((next, id) => {
    const i = library.indexOf(id);
    return i < 0 ? next : identify(next, i, id);
  }, slots);
};

const record = (
  ledger: KnownLedger,
  slots: Slot[],
  logLength: number
): KnownLedger => {
  const past = ledger.past.slice(0, logLength);
  past[logLength] = slots;
  return { slots, past };
};

// The cards each placement put in, in the order the reducer did.
const placeEntries = (
  slots: Slot[],
  action: GameAction,
  after: InstanceId[],
  ids: ReadonlySet<InstanceId>
): Slot[] => {
  const next = [...slots];
  after.forEach((id, i) => {
    if (ids.has(id)) next.splice(i, 0, entering(action, id));
  });
  return next;
};

const step = (
  ledger: KnownLedger,
  before: GameState,
  action: GameAction,
  after: GameState,
  playerId: PlayerId
): Slot[] => {
  const was = libraryOf(before, playerId);
  const now = libraryOf(after, playerId);
  const shown = (slots: Slot[]) => shownInLibrary(slots, after, playerId);
  if (shufflesLibrary(before, action, playerId)) {
    // Only what the action places after its shuffle is known.
    const placed = new Set(
      action.type === 'searchLibrary' ? replaced(action, playerId) : []
    );
    const blank = unknown(now.length);
    now.forEach((id, i) => {
      if (placed.has(id)) blank[i] = exact(id);
    });
    return shown(blank);
  }
  const moved = new Set(replaced(action, playerId));
  const kept = new Set(now);
  const left = was.filter((id) => !kept.has(id) || moved.has(id));
  let slots = slotsFor(ledger, was.length);
  const fromTop =
    takesFromTop.has(action.type) && left.every((id, i) => was[i] === id);
  if (fromTop) {
    slots = forget(slots.slice(left.length), new Set(left));
  } else {
    left.forEach((id) => {
      slots = removeCard(slots, id);
    });
  }
  const had = new Set(was);
  const enters = new Set(now.filter((id) => !had.has(id) || moved.has(id)));
  slots = placeEntries(slots, action, now, enters);
  if (slots.length !== now.length) return shown(unknown(now.length));
  return shown(slots);
};

// After one applied action.
export const learnFromAction = (
  ledger: KnownLedger,
  before: GameState,
  action: GameAction,
  after: GameState,
  playerId: PlayerId
): KnownLedger =>
  record(
    ledger,
    step(ledger, before, action, after, playerId),
    after.log.length
  );

// Copies what was learned since into the restored slots: exact cards
// one by one, and a random block only where nothing was known before.
const mergeInto = (base: Slot[], learned: Slot[]): Slot[] => {
  let next = base;
  learned.forEach((slot, i) => {
    if (slot?.length === 1) next = identify(next, i, slot[0]);
  });
  const blocks = new Map<string, number[]>();
  learned.forEach((slot, i) => {
    if (slot && slot.length > 1) {
      const key = slot.join('\u0000');
      blocks.set(key, [...(blocks.get(key) ?? []), i]);
    }
  });
  blocks.forEach((at) => {
    if (at.every((i) => next[i] === null)) {
      next = [...next];
      at.forEach((i) => {
        next[i] = learned[i];
      });
    }
  });
  return next;
};

// After an undo, the player knows what they knew before the undone
// action. They also keep what they saw since, but only where the undone
// action moved cards in a way they watched: from the top, in order.
export const learnFromUndo = (
  ledger: KnownLedger,
  before: GameState,
  after: GameState,
  playerId: PlayerId
): KnownLedger => {
  const at = after.log.length;
  const now = libraryOf(after, playerId);
  const restoresPrefix =
    at === before.log.length - 1 &&
    after.log.every((action, i) => action === before.log[i]);
  if (!restoresPrefix) return { slots: unknown(now.length), past: [] };
  const then = ledger.past[at];
  let slots: Slot[] =
    then && then.length === now.length ? [...then] : unknown(now.length);
  const was = libraryOf(before, playerId);
  const current = slotsFor(ledger, was.length);
  const undone = before.log[at];
  if (was.length === now.length && was.every((id, i) => now[i] === id)) {
    slots = mergeInto(slots, current);
  } else if (undone.type === 'arrangeTop' && !undone.shuffleAfter) {
    // The looked-at cards return to the top in the order they were seen.
    const looked =
      undone.top.length +
      undone.bottom.length +
      undone.graveyard.length +
      undone.exile.length +
      undone.hand.length +
      (undone.battlefield?.length ?? 0);
    const middle = current.slice(
      undone.top.length,
      current.length - undone.bottom.length
    );
    const learned = [...now.slice(0, looked).map(exact), ...middle];
    if (learned.length === now.length) slots = mergeInto(slots, learned);
  } else if (takesFromTop.has(undone.type)) {
    // Drawn or milled cards go back on top, in the order they left.
    const back = now.length - was.length;
    const same = back > 0 && was.every((id, i) => now[back + i] === id);
    if (same) {
      slots = mergeInto(slots, [...now.slice(0, back).map(exact), ...current]);
    }
  }
  return record(ledger, slots, at);
};

// From one state to the next, whichever way the game went.
export const learnFromChange = (
  ledger: KnownLedger,
  before: GameState,
  after: GameState,
  playerId: PlayerId
): KnownLedger => {
  if (after === before) return ledger;
  const appended =
    after.log.length === before.log.length + 1 &&
    after.log[before.log.length - 1] === before.log.at(-1);
  const action = after.log.at(-1);
  const next =
    appended && action
      ? learnFromAction(ledger, before, action, after, playerId)
      : learnFromUndo(ledger, before, after, playerId);
  return truthful(next, after, playerId) ? next : NO_KNOWLEDGE;
};

// Whether every known position holds one of its cards in the real
// library. A ledger that fails this was modelled wrong somewhere, and
// is dropped rather than ever shown.
export const truthful = (
  ledger: KnownLedger,
  state: GameState,
  playerId: PlayerId
): boolean => {
  const library = libraryOf(state, playerId);
  if (ledger.slots.length !== library.length) return ledger.slots.length === 0;
  return ledger.slots.every((slot, i) => !slot || slot.includes(library[i]));
};

// Cards the player looked at without the game changing: a look that put
// everything back as it was, or the top card they always look at. Only
// cards that are exactly the top of the library are taken.
export const learnTop = (
  ledger: KnownLedger,
  state: GameState,
  playerId: PlayerId,
  ids: readonly InstanceId[]
): KnownLedger => {
  const library = libraryOf(state, playerId);
  const onTop = ids.length > 0 && ids.every((id, i) => library[i] === id);
  if (!onTop) return ledger;
  const before = slotsFor(ledger, library.length);
  const slots = ids.reduce((next, id, i) => identify(next, i, id), before);
  if (slots.every((slot, i) => sameSlot(slot, ledger.slots[i] ?? null))) {
    return ledger;
  }
  return record(ledger, slots, state.log.length);
};

// A run of known positions as the player may see it. Each random block
// is filled in by name (then id), never in its real order, even where
// known cards sit between its positions.
const present = (
  slots: Slot[],
  state: GameState,
  from: number,
  to: number
): KnownCard[] => {
  const byName = (a: InstanceId, b: InstanceId) =>
    state.cards[a].ref.name.localeCompare(state.cards[b].ref.name) ||
    a.localeCompare(b);
  const fill = new Map<string, InstanceId[]>();
  return slots.slice(from, to).map((slot) => {
    const ids = slot ?? [];
    if (ids.length === 1) {
      return { instanceId: ids[0], ref: state.cards[ids[0]].ref };
    }
    const key = ids.join('\u0000');
    const queue = fill.get(key) ?? [...ids].sort(byName);
    fill.set(key, queue);
    const id = queue.shift() ?? ids[0];
    return { instanceId: id, ref: state.cards[id].ref, random: true };
  });
};

// The unbroken runs of known cards from the top and from the bottom.
export const knownCards = (
  state: GameState,
  playerId: PlayerId,
  ledger: KnownLedger
): KnownCards => {
  const length = libraryOf(state, playerId).length;
  if (ledger.slots.length !== length || !truthful(ledger, state, playerId)) {
    return { top: [], bottom: [] };
  }
  const slots = [...ledger.slots];
  let top = 0;
  while (top < length && slots[top]) top += 1;
  let bottom = length;
  while (bottom > top && slots[bottom - 1]) bottom -= 1;
  return {
    top: present(slots, state, 0, top),
    bottom: present(slots, state, bottom, length),
  };
};
