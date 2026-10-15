import type { ArrangeTopAction, PlayerId } from '@shared/game';

export type Lane = 'top' | 'bottom' | 'graveyard' | 'exile' | 'hand';

// The order lanes are shown in, top to bottom.
export const lanes: readonly Lane[] = [
  'top',
  'bottom',
  'graveyard',
  'exile',
  'hand',
];

export const laneKeys: Record<Lane, string> = {
  top: 't',
  bottom: 'b',
  graveyard: 'g',
  exile: 'e',
  hand: 'h',
};

export const laneNames: Record<Lane, string> = {
  top: 'Top',
  bottom: 'Bottom',
  graveyard: 'Graveyard',
  exile: 'Exile',
  hand: 'Hand',
};

// Which end of each lane is which, since every lane reads left to right.
export const laneHints: Record<Lane, string> = {
  top: 'left is the top card',
  bottom: 'right is the bottom card',
  graveyard: 'right ends on top',
  exile: 'right ends on top',
  hand: 'in this order',
};

export type PresetId = 'look' | 'scry' | 'surveil' | 'take' | 'ponder' | 'dig';

export interface Preset {
  id: PresetId;
  label: string;
  // The lanes offered, in display order; cards start in the first.
  lanes: readonly Lane[];
  // Some cards take a set number of cards into hand (Impulse).
  takes?: boolean;
  // Offers shuffling the library instead of keeping the order (Ponder).
  shuffles?: boolean;
  count?: number;
}

export const presets: readonly Preset[] = [
  { id: 'look', label: 'Look', lanes },
  { id: 'scry', label: 'Scry', lanes: ['top', 'bottom'] },
  { id: 'surveil', label: 'Surveil', lanes: ['top', 'graveyard'] },
  {
    id: 'take',
    label: 'Impulse',
    lanes: ['bottom', 'hand'],
    takes: true,
  },
  { id: 'ponder', label: 'Ponder', lanes: ['top'], shuffles: true, count: 3 },
  {
    id: 'dig',
    label: 'Dig',
    lanes: ['exile', 'hand', 'top', 'bottom', 'graveyard'],
  },
];

export const presetById = (id: PresetId): Preset =>
  presets.find((preset) => preset.id === id) ?? presets[0]!;

export const defaultLane = (preset: Preset): Lane => preset.lanes[0]!;

export const titleFor = (preset: Preset, count: number, take: number) => {
  switch (preset.id) {
    case 'look':
      return `Top ${count} of your library`;
    case 'take':
      return `Look at ${count}, take ${take}`;
    case 'ponder':
      return 'Ponder';
    default:
      return `${preset.label} ${count}`;
  }
};

export type Arrangement = Record<Lane, string[]>;

const empty = (): Arrangement => ({
  top: [],
  bottom: [],
  graveyard: [],
  exile: [],
  hand: [],
});

// Every looked-at card starts in the preset's default lane, in library
// order, so confirming straight away changes nothing for scry or look.
export const initialArrangement = (
  ids: readonly string[],
  preset: Preset
): Arrangement => ({ ...empty(), [defaultLane(preset)]: [...ids] });

export const laneOf = (
  arrangement: Arrangement,
  id: string
): Lane | undefined => lanes.find((lane) => arrangement[lane].includes(id));

// The cards in display order, which is the order ←/→ walk.
export const flatten = (arrangement: Arrangement): string[] =>
  lanes.flatMap((lane) => arrangement[lane]);

// Puts a card in a lane at index (the end when omitted), taking it out
// of wherever it was.
export const moveCard = (
  arrangement: Arrangement,
  id: string,
  lane: Lane,
  index?: number
): Arrangement => {
  const from = laneOf(arrangement, id);
  if (!from) return arrangement;
  const next = {
    ...arrangement,
    [from]: arrangement[from].filter((x) => x !== id),
  };
  const target = [...next[lane]];
  const at = Math.max(0, Math.min(index ?? target.length, target.length));
  target.splice(at, 0, id);
  return { ...next, [lane]: target };
};

// Swaps a card with its neighbour in the same lane.
export const shiftCard = (
  arrangement: Arrangement,
  id: string,
  by: -1 | 1
): Arrangement => {
  const lane = laneOf(arrangement, id);
  if (!lane) return arrangement;
  const at = arrangement[lane].indexOf(id);
  const to = at + by;
  if (to < 0 || to >= arrangement[lane].length) return arrangement;
  const order = [...arrangement[lane]];
  [order[at], order[to]] = [order[to]!, order[at]!];
  return { ...arrangement, [lane]: order };
};

// A new preset keeps what fits and sends the rest to its default lane.
export const applyPreset = (
  arrangement: Arrangement,
  preset: Preset
): Arrangement => {
  const home = defaultLane(preset);
  return lanes.reduce((next, lane) => {
    if (preset.lanes.includes(lane)) return next;
    return arrangement[lane].reduce((acc, id) => moveCard(acc, id, home), next);
  }, arrangement);
};

// Sends every card the player hasn't placed yet to the bottom.
export const restToBottom = (
  arrangement: Arrangement,
  placed: ReadonlySet<string>
): Arrangement =>
  flatten(arrangement)
    .filter((id) => !placed.has(id) && laneOf(arrangement, id) !== 'bottom')
    .reduce((next, id) => moveCard(next, id, 'bottom'), arrangement);

interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

// Where a card dropped at (x, y) goes among a lane's other cards, which
// may wrap onto several rows: before the first card it is above or left of.
export const dropIndex = (
  cards: readonly Bounds[],
  x: number,
  y: number
): number => {
  const at = cards.findIndex(
    (card) =>
      y < card.top || (y <= card.bottom && x < (card.left + card.right) / 2)
  );
  return at < 0 ? cards.length : at;
};

export const toAction = (
  arrangement: Arrangement,
  playerId: PlayerId,
  options: { bottomRandom: boolean; shuffleAfter: boolean }
): ArrangeTopAction => ({
  type: 'arrangeTop',
  playerId,
  top: arrangement.top,
  bottom: arrangement.bottom,
  graveyard: arrangement.graveyard,
  exile: arrangement.exile,
  hand: arrangement.hand,
  ...(options.bottomRandom &&
    arrangement.bottom.length > 1 && {
      bottomRandom: true,
    }),
  ...(options.shuffleAfter && { shuffleAfter: true }),
});
