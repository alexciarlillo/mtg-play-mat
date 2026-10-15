import { currentFace } from './cardRefs';
import type {
  CardTypeFilter,
  GameAction,
  GameState,
  InstanceId,
  Phase,
  PlayerId,
  SearchDestination,
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

// "a, b and c"
const joinParts = (parts: string[]) =>
  parts.length < 2
    ? parts.join('')
    : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;

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

// 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st.
export const ordinal = (n: number) => {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
};

const libraryPlace = (index: number | undefined, size: number) => {
  if (index === 0) return 'on top of their library';
  if (index === undefined || index >= size)
    return 'on the bottom of their library';
  return `into their library ${ordinal(index + 1)} from the top`;
};

// Hidden zones that lost cards, told by the hidden counts.
const hiddenDrops = (before: PublicView, after: PublicView): ZoneId[] => [
  ...(after.handCount < before.handCount ? (['hand'] as const) : []),
  ...(after.libraryCount < before.libraryCount ? (['library'] as const) : []),
];

// Where a card that wasn't public came from, if only one place it could.
const hiddenSource = (before: PublicView, after: PublicView): ZoneId | null => {
  const drops = hiddenDrops(before, after);
  return drops.length === 1 ? drops[0] : null;
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
  const tapped = to === 'battlefield' && now?.tapped ? ' tapped' : '';
  const destination =
    to === 'library'
      ? libraryPlace(action.index, after.libraryCount - 1)
      : `${into[to]}${tapped}`;

  if (!was && !now) {
    // Hidden to hidden: only the zones are known.
    return `put ${cards(1)} from ${from[source]} ${destination}`;
  }
  if (source === 'hand' && to === 'battlefield') {
    return now?.ref
      ? `played ${name}${tapped}`
      : `played a card face down${tapped}`;
  }
  if (source === 'hand' && to === 'graveyard') return `discarded ${name}`;
  if (source === 'library' && to === 'graveyard') return `milled ${name}`;
  if (to === 'battlefield' && now && !now.ref) {
    return `put a card from ${from[source]} ${into.battlefield} face down${tapped}`;
  }
  return `put ${name} ${destination} from ${from[source]}`;
};

// A long list names the first few cards and counts the rest.
const MAX_NAMED = 5;

const someNames = (names: string[], unnamed: number) => {
  const shown =
    names.length > MAX_NAMED ? names.slice(0, MAX_NAMED - 1) : names;
  const more = names.length - shown.length + unnamed;
  if (shown.length === 0) return '';
  return more === 0 ? joinParts(shown) : `${shown.join(', ')} and ${more} more`;
};

const pluralType = (type: string) =>
  type.endsWith('y') ? `${type.slice(0, -1)}ies` : `${type}s`;

// "3 creatures", "2 nonland permanents", "4 artifacts and enchantments".
const bulkNoun = (
  count: number,
  from: ZoneId | null,
  filter: CardTypeFilter | undefined
) => {
  const non = (filter?.excludeTypes ?? [])
    .map((type) => `non${type.toLowerCase()} `)
    .join('');
  const types = (filter?.types ?? []).map((type) => type.toLowerCase());
  if (types.length === 0) {
    const base = from === 'battlefield' ? 'permanent' : 'card';
    return plural(count, `${non}${base}`);
  }
  const listed =
    count === 1 ? types.join(' or ') : joinParts(types.map(pluralType));
  return `${count} ${non}${listed}`;
};

interface BulkMoved {
  names: string[];
  // Cards that were hidden before and after, so only counted.
  hidden: number;
  source: ZoneId | null;
}

// A borrowed permanent that left is told by main, which knows its owner.
const departed = (view: PublicView, card: CardView, after: PublicView) =>
  card.owner !== view.playerId && !findCard(after, card.instanceId);

const movedCards = (
  before: PublicView,
  after: PublicView,
  ids: InstanceId[]
): BulkMoved => {
  const names: string[] = [];
  const sources = new Set<ZoneId>();
  let hidden = 0;
  ids.forEach((id) => {
    const was = findCard(before, id);
    const now = findCard(after, id);
    if (was && now && was.zone === now.zone) return;
    if (was && departed(before, was, after)) return;
    if (!was && !now) {
      hidden += 1;
      return;
    }
    names.push(bestName(before, after, id));
    if (was) sources.add(was.zone);
    else hiddenDrops(before, after).forEach((zone) => sources.add(zone));
  });
  if (hidden > 0) {
    hiddenDrops(before, after).forEach((zone) => sources.add(zone));
  }
  return {
    names,
    hidden,
    source: sources.size === 1 ? [...sources][0] : null,
  };
};

const movedFrom = (
  before: PublicView,
  after: PublicView,
  from: ZoneId,
  to: ZoneId
): BulkMoved => {
  if (from === 'hand' || from === 'library') {
    const count = (view: PublicView) =>
      from === 'hand' ? view.handCount : view.libraryCount;
    const names =
      to === 'hand' || to === 'library'
        ? []
        : arrived(before, after, to).map(nameOf);
    const total = count(before) - count(after);
    return { names, hidden: Math.max(0, total - names.length), source: from };
  }
  const still = new Set(after.zones[from].map((card) => card.instanceId));
  const names = before.zones[from]
    .filter((card) => !still.has(card.instanceId))
    .filter((card) => !departed(before, card, after))
    .map((card) => bestName(before, after, card.instanceId));
  return { names, hidden: 0, source: from };
};

const describeBulkMove = (
  before: PublicView,
  after: PublicView,
  action: Extract<GameAction, { type: 'moveCards' | 'moveAll' }>
) => {
  const moved =
    action.type === 'moveAll'
      ? movedFrom(before, after, action.from, action.to)
      : movedCards(before, after, action.instanceIds);
  const count = moved.names.length + moved.hidden;
  if (count === 0) return null;
  // A filter on cards nobody saw would tell their types, so hidden moves
  // are only ever cards.
  const filter =
    action.type === 'moveAll' && moved.hidden === 0 ? action.filter : undefined;
  const what = bulkNoun(count, moved.source, filter);
  const source = moved.source ? ` from ${from[moved.source]}` : '';
  const index = action.type === 'moveCards' ? action.index : undefined;
  const tapped = action.type === 'moveCards' && action.tapped ? ' tapped' : '';
  const destination =
    action.to === 'library'
      ? libraryPlace(index, after.libraryCount - count)
      : `${into[action.to]}${tapped}`;
  const names = someNames(moved.names, moved.hidden);
  return `put ${what}${source} ${destination}${names ? `: ${names}` : ''}`;
};

const describeSetTapped = (
  before: PublicView,
  after: PublicView,
  action: Extract<GameAction, { type: 'setTapped' }>
) => {
  const changed = action.instanceIds.flatMap((id) => {
    const was = findCard(before, id);
    const now = findCard(after, id);
    return was && now && was.tapped !== now.tapped ? [now] : [];
  });
  if (changed.length === 0) return null;
  const verb = action.tapped ? 'tapped' : 'untapped';
  const names = changed.map(nameOf);
  return changed.length === 1
    ? `${verb} ${names[0]}`
    : `${verb} ${changed.length} permanents: ${someNames(names, 0)}`;
};

const describeMill = (
  before: PublicView,
  after: PublicView,
  action: Extract<GameAction, { type: 'mill' }>
) => {
  const to = action.to ?? 'graveyard';
  const names = arrived(before, after, to).map(nameOf);
  if (names.length === 0) return null;
  if (to === 'graveyard') {
    return `milled ${cards(names.length)}: ${listNames(names)}`;
  }
  const top =
    names.length === 1 ? 'the top card' : `the top ${names.length} cards`;
  return `exiled ${top} of their library: ${listNames(names)}`;
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
    action.exile.length +
    action.hand.length;
  const named = (zone: 'graveyard' | 'exile') =>
    listNames(arrived(before, after, zone).map(nameOf));
  const bottom =
    action.bottomRandom && action.bottom.length > 1
      ? 'on the bottom in a random order'
      : 'on the bottom';
  // A shuffle afterwards mixes whatever stayed in the library anyway.
  const kept = !action.shuffleAfter;
  const parts = [
    kept && action.top.length > 0 && `${action.top.length} on top`,
    kept && action.bottom.length > 0 && `${action.bottom.length} ${bottom}`,
    action.graveyard.length > 0 && `${named('graveyard')} into their graveyard`,
    action.exile.length > 0 && `${named('exile')} into exile`,
    action.hand.length > 0 && `${cards(action.hand.length)} into their hand`,
  ].filter((part): part is string => typeof part === 'string');
  const looked = `looked at the top ${cards(total)} of their library`;
  const line = parts.length > 0 ? `${looked}: ${parts.join(', ')}` : looked;
  if (!action.shuffleAfter) return line;
  return parts.length > 0 ? `${line}, then shuffled` : `${line} and shuffled`;
};

const describeSearch = (
  before: PublicView,
  after: PublicView,
  action: Extract<GameAction, { type: 'searchLibrary' }>
) => {
  const count = (to: SearchDestination) =>
    action.picks.filter((pick) => pick.to === to).length;
  if (action.picks.length === 0) {
    return `searched their library${action.shuffle ? ' and shuffled it' : ''}`;
  }
  const entered = arrived(before, after, 'battlefield');
  const named = (shown: CardView[], where: string) =>
    shown.length > 0 && `${joinParts(shown.map(nameOf))} ${where}`;
  const counted = (n: number, where: string) => n > 0 && `${cards(n)} ${where}`;
  const parts = [
    named(
      entered.filter((card) => !card.tapped),
      into.battlefield
    ),
    named(
      entered.filter((card) => card.tapped),
      `${into.battlefield} tapped`
    ),
    named(arrived(before, after, 'graveyard'), into.graveyard),
    named(arrived(before, after, 'exile'), into.exile),
    counted(count('hand'), into.hand),
    counted(count('top'), 'on top of their library'),
    counted(count('bottom'), 'on the bottom of their library'),
  ].filter((part): part is string => typeof part === 'string');
  const found = joinParts(parts);
  // The shuffle comes before placing, which matters for library picks.
  if (!action.shuffle) return `searched their library and put ${found}`;
  return count('top') + count('bottom') > 0
    ? `searched their library, then shuffled, and put ${found}`
    : `searched their library and put ${found}, then shuffled`;
};

// Hand to library is hidden to hidden, so only the counts are told.
const describePutFromHand = (
  action: Extract<GameAction, { type: 'putFromHand' }>
) => {
  const parts = [
    action.top.length > 0 && `${cards(action.top.length)} on top`,
    action.bottom.length > 0 && `${cards(action.bottom.length)} on the bottom`,
  ].filter((part): part is string => typeof part === 'string');
  return `put ${joinParts(parts)} of their library from their hand`;
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
    case 'setPositions':
      return null;
    case 'moveCards':
    case 'moveAll':
      return describeBulkMove(before, after, action);
    case 'setTapped':
      return describeSetTapped(before, after, action);
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
    case 'mill':
      return describeMill(before, after, action);
    case 'arrangeTop':
      return describeArrange(before, after, action);
    case 'searchLibrary':
      return describeSearch(before, after, action);
    case 'putFromHand':
      return describePutFromHand(action);
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
    // Told by main, which knows the other player's name.
    case 'giveControl':
    case 'gainControl':
    case 'releaseControl':
    case 'regainControl':
      return null;
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
