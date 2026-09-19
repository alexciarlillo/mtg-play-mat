import { currentFace } from './cardRefs';
import type {
  GameAction,
  GameState,
  InstanceId,
  Phase,
  PlayerId,
  ZoneId,
} from './types';
import {
  type CardView,
  publicView,
  type PublicView,
  type PublicZoneId,
} from './views';

// Log text is built from two public views and nothing else, so it can
// never name a card that only its owner may know. The action itself is
// used for its shape (counts, destinations), never for card identities.

const publicZones: PublicZoneId[] = [
  'battlefield',
  'graveyard',
  'exile',
  'command',
];

const findCard = (view: PublicView, id: InstanceId): CardView | undefined =>
  publicZones
    .map((zone) => view.zones[zone].find((card) => card.instanceId === id))
    .find((card) => card !== undefined);

const nameOf = (card: CardView | undefined): string => {
  if (!card) return 'a card';
  if (!card.ref) return 'a face-down card';
  return currentFace(card.ref, card.faceIndex)?.name ?? card.ref.name;
};

// Prefer the view where the card is public and face up.
const bestName = (before: PublicView, after: PublicView, id: InstanceId) => {
  const later = findCard(after, id);
  return later?.ref ? nameOf(later) : nameOf(findCard(before, id) ?? later);
};

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

const cards = (count: number) =>
  count === 1 ? 'a card' : plural(count, 'card');

const listNames = (names: string[]) => names.join(', ');

// Cards that are in a public zone after the action but weren't before.
const arrived = (before: PublicView, after: PublicView, zone: PublicZoneId) => {
  const had = new Set(before.zones[zone].map((card) => card.instanceId));
  return after.zones[zone].filter((card) => !had.has(card.instanceId));
};

const into: Record<ZoneId, string> = {
  battlefield: 'onto the battlefield',
  graveyard: 'into their graveyard',
  exile: 'into exile',
  command: 'into the command zone',
  hand: 'into their hand',
  library: 'into their library',
};

const from: Record<ZoneId, string> = {
  battlefield: 'the battlefield',
  graveyard: 'their graveyard',
  exile: 'exile',
  command: 'the command zone',
  hand: 'their hand',
  library: 'their library',
};

const phaseNames: Record<Phase, string> = {
  untap: 'untap step',
  upkeep: 'upkeep',
  draw: 'draw step',
  main1: 'first main phase',
  combat: 'combat',
  main2: 'second main phase',
  end: 'end step',
};

const libraryPlace = (index: number | undefined, size: number) => {
  if (index === 0) return 'on top of their library';
  if (index === undefined || index >= size)
    return 'on the bottom of their library';
  return `into their library, ${index + 1} from the top`;
};

// Where a card that wasn't public came from, told by the hidden counts.
const hiddenSource = (before: PublicView, after: PublicView): ZoneId | null => {
  if (after.handCount < before.handCount) return 'hand';
  if (after.libraryCount < before.libraryCount) return 'library';
  return null;
};

const describeMove = (
  before: PublicView,
  after: PublicView,
  action: Extract<GameAction, { type: 'moveCard' }>
): string | null => {
  const { instanceId: id, to } = action;
  const was = findCard(before, id);
  const now = findCard(after, id);
  const source = was?.zone ?? hiddenSource(before, after);
  if (!source || (source === to && to !== 'battlefield')) return null;
  // Dragging a permanent around the battlefield isn't worth a line.
  if (source === 'battlefield' && to === 'battlefield') return null;

  const name = bestName(before, after, id);
  const destination =
    to === 'library'
      ? libraryPlace(action.index, after.libraryCount - 1)
      : into[to];

  if (!was && !now) {
    // Hidden to hidden: only the zones are known.
    return `put ${cards(1)} from ${from[source]} ${destination}`;
  }
  if (source === 'hand' && to === 'battlefield') {
    return now?.ref ? `played ${name}` : 'played a card face down';
  }
  if (source === 'hand' && to === 'graveyard') return `discarded ${name}`;
  if (source === 'library' && to === 'graveyard') return `milled ${name}`;
  if (to === 'battlefield' && now && !now.ref) {
    return `put a card from ${from[source]} onto the battlefield face down`;
  }
  return `put ${name} ${destination} from ${from[source]}`;
};

const lifeChange = (who: string, was: number, now: number) => {
  const delta = now - was;
  if (delta === 0) return null;
  const verb = delta < 0 ? 'lost' : 'gained';
  return `${who}${verb} ${Math.abs(delta)} life (${was} → ${now})`;
};

const counterChange = (name: string, was: number, now: number) => {
  const delta = now - was;
  if (delta === 0) return null;
  const counters = plural(Math.abs(delta), `${name} counter`);
  return delta > 0
    ? `got ${counters} (now ${now})`
    : `lost ${counters} (now ${now})`;
};

const describeArrange = (
  before: PublicView,
  after: PublicView,
  action: Extract<GameAction, { type: 'arrangeTop' }>
) => {
  const total =
    action.top.length +
    action.bottom.length +
    action.graveyard.length +
    action.hand.length;
  const parts = [
    action.top.length > 0 && `${action.top.length} on top`,
    action.bottom.length > 0 && `${action.bottom.length} on the bottom`,
    action.graveyard.length > 0 &&
      `${listNames(arrived(before, after, 'graveyard').map(nameOf))} into ` +
        'their graveyard',
    action.hand.length > 0 && `${cards(action.hand.length)} into their hand`,
  ].filter((part): part is string => typeof part === 'string');
  const looked = `looked at the top ${cards(total)} of their library`;
  return parts.length > 0 ? `${looked}: ${parts.join(', ')}` : looked;
};

const describeSearch = (
  before: PublicView,
  after: PublicView,
  action: Extract<GameAction, { type: 'searchLibrary' }>
) => {
  const count = action.instanceIds.length;
  const shuffled = action.shuffle ? ', then shuffled' : '';
  if (count === 0) {
    return `searched their library${action.shuffle ? ' and shuffled it' : ''}`;
  }
  let found: string;
  if (action.to === 'hand') found = `${cards(count)} into their hand`;
  else if (action.to === 'library') {
    found = `${cards(count)} on top of their library`;
  } else {
    const shown = arrived(before, after, action.to).map(nameOf);
    found = `${listNames(shown)} ${into[action.to]}`;
  }
  return action.to === 'library'
    ? `searched their library${shuffled}, and put ${found}`
    : `searched their library and put ${found}${shuffled}`;
};

const describeReveal = (
  after: PublicView,
  action: Extract<GameAction, { type: 'reveal' }>
) => {
  const shown = (after.revealed?.cards ?? []).map(
    (ref) => currentFace(ref, 0)?.name ?? ref.name
  );
  if (shown.length === 0) return null;
  switch (action.source) {
    case 'hand':
      return `revealed their hand: ${listNames(shown)}`;
    case 'libraryTop':
      return shown.length === 1
        ? `revealed the top card of their library: ${shown[0]}`
        : `revealed the top ${shown.length} cards of their library: ` +
            listNames(shown);
    case 'card':
      return `revealed ${listNames(shown)} from their hand`;
  }
};

const dummyName = (view: PublicView, id: string | undefined) =>
  view.dummies.find((dummy) => dummy.id === id)?.name ?? 'a placeholder';

// A short past-tense line for the log, to follow the player's name, or
// null when the action isn't worth one.
export const describeAction = (
  before: PublicView,
  action: GameAction,
  after: PublicView
): string | null => {
  const name = (id: InstanceId) => bestName(before, after, id);
  switch (action.type) {
    case 'newGame':
      return 'started a new game';
    case 'shuffle':
      return 'shuffled their library';
    case 'draw': {
      const drawn = before.libraryCount - after.libraryCount;
      return drawn > 0 ? `drew ${cards(drawn)}` : null;
    }
    case 'moveCard':
      return describeMove(before, after, action);
    case 'setPosition':
      return null;
    case 'shuffleIntoLibrary': {
      const was = findCard(before, action.instanceId);
      return was
        ? `shuffled ${nameOf(was)} into their library`
        : 'shuffled a card from their hand into their library';
    }
    case 'tap':
    case 'untap':
    case 'toggleTap': {
      const now = findCard(after, action.instanceId);
      if (!now) return null;
      return `${now.tapped ? 'tapped' : 'untapped'} ${nameOf(now)}`;
    }
    case 'untapAll':
      return 'untapped all their permanents';
    case 'adjustLife':
    case 'setLife':
      return lifeChange('', before.life, after.life);
    case 'mulligan':
      return `took a mulligan (${after.mulligans} so far)`;
    case 'keepHand': {
      const bottom = action.bottom.length;
      return bottom > 0
        ? `kept their hand, putting ${cards(bottom)} on the bottom`
        : `kept their hand of ${after.handCount}`;
    }
    case 'adjustCounter': {
      const was = findCard(before, action.instanceId);
      const now = findCard(after, action.instanceId);
      const change = counterChange(
        action.counter,
        was?.counters[action.counter] ?? 0,
        now?.counters[action.counter] ?? 0
      );
      return change && `${name(action.instanceId)}: ${change}`;
    }
    case 'adjustPlayerCounter':
      return counterChange(
        action.counter,
        before.counters[action.counter] ?? 0,
        after.counters[action.counter] ?? 0
      );
    case 'createTokens': {
      const made = arrived(before, after, 'battlefield');
      if (made.length === 0) return null;
      const token = nameOf(made[0]);
      return made.length === 1
        ? `created a ${token} token`
        : `created ${made.length} ${token} tokens`;
    }
    case 'copyCard':
      return `created a token copy of ${name(action.instanceId)}`;
    case 'setFaceDown':
      return action.faceDown
        ? `turned ${nameOf(findCard(before, action.instanceId))} face down`
        : `turned a face-down card face up: ${name(action.instanceId)}`;
    case 'transform': {
      const was = nameOf(findCard(before, action.instanceId));
      return `transformed ${was} into ${name(action.instanceId)}`;
    }
    case 'attach':
      return action.to
        ? `attached ${name(action.instanceId)} to ${name(action.to)}`
        : `unattached ${name(action.instanceId)}`;
    case 'mill': {
      const milled = arrived(before, after, 'graveyard').map(nameOf);
      return milled.length > 0
        ? `milled ${cards(milled.length)}: ${listNames(milled)}`
        : null;
    }
    case 'arrangeTop':
      return describeArrange(before, after, action);
    case 'searchLibrary':
      return describeSearch(before, after, action);
    case 'reveal':
      return describeReveal(after, action);
    case 'hideReveal':
      return 'stopped revealing';
    case 'nextTurn': {
      const drew = before.libraryCount > after.libraryCount;
      return `started turn ${after.turn ?? '?'}${drew ? ' and drew a card' : ''}`;
    }
    case 'setPhase':
      return after.phase ? `moved to the ${phaseNames[after.phase]}` : null;
    case 'adjustCommanderCasts': {
      const now = findCard(after, action.instanceId);
      return `set ${nameOf(now)}'s cast count to ${now?.commanderCasts ?? 0}`;
    }
    case 'adjustCommanderDamage': {
      const who = action.dummyId ? `${dummyName(after, action.dummyId)} ` : '';
      const amount = Math.abs(action.delta);
      return action.delta > 0
        ? `${who}took ${amount} commander damage from ${action.sourceName}`.trim()
        : `removed ${amount} commander damage from ${action.sourceName}` +
            (who ? ` on ${who.trim()}` : '');
    }
    case 'addDummy': {
      const added = after.dummies.at(-1);
      return `added a placeholder opponent${added ? `, ${added.name}` : ''}`;
    }
    case 'removeDummy':
      return `removed the placeholder opponent ${dummyName(before, action.dummyId)}`;
    case 'adjustDummyLife': {
      const was = before.dummies.find((d) => d.id === action.dummyId);
      const now = after.dummies.find((d) => d.id === action.dummyId);
      if (!was || !now) return null;
      return lifeChange(`${now.name} `, was.life, now.life);
    }
  }
};

// Describes one step of a player's game by way of its public views only.
export const describeStep = (
  before: GameState,
  action: GameAction,
  after: GameState,
  playerId: PlayerId
): string | null => {
  const was = publicView(before, playerId);
  const now = publicView(after, playerId);
  return was && now ? describeAction(was, action, now) : null;
};
