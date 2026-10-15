import { type Color, toColors } from './facts';
import type { QueryNode } from './parse';
import { fold } from './searchable';

export const CHIP_TYPES = [
  'Creature',
  'Planeswalker',
  'Battle',
  'Instant',
  'Sorcery',
  'Artifact',
  'Enchantment',
  'Land',
] as const;

export type ChipType = (typeof CHIP_TYPES)[number];

export type MvOp = '=' | '<=' | '>=';
export type ColorMode = 'includes' | 'exactly' | 'atMost';

// The point-and-click filters. They compile to the same query tree the
// text box parses, so both filter through one matcher.
export interface Chips {
  // Any of these types (OR).
  types: ChipType[];
  subtype: string;
  mv: { op: MvOp; value: number } | null;
  colors: Color[];
  // Colourless only; never combined with colours.
  colorless: boolean;
  colorMode: ColorMode;
}

export const emptyChips: Chips = {
  types: [],
  subtype: '',
  mv: null,
  colors: [],
  colorless: false,
  colorMode: 'includes',
};

const MODE_OPS: Record<ColorMode, '>=' | '=' | '<='> = {
  includes: '>=',
  exactly: '=',
  atMost: '<=',
};

// ANDs any number of optional nodes into one; null when there are none.
export const allOf = (...parts: (QueryNode | null)[]): QueryNode | null => {
  const nodes = parts.flatMap((node): QueryNode[] => {
    if (node === null) return [];
    return node.kind === 'and' ? node.nodes : [node];
  });
  if (nodes.length <= 1) return nodes[0] ?? null;
  return { kind: 'and', nodes };
};

const typeTerm = (value: string): QueryNode => ({
  kind: 'text',
  field: 'type',
  value: fold(value),
});

export const chipsToQuery = (chips: Chips): QueryNode | null => {
  const types: QueryNode | null =
    chips.types.length === 0
      ? null
      : chips.types.length === 1
        ? typeTerm(chips.types[0]!)
        : { kind: 'or', nodes: chips.types.map(typeTerm) };
  const subtype: QueryNode | null = chips.subtype.trim()
    ? { kind: 'subtype', value: fold(chips.subtype) }
    : null;
  const mv: QueryNode | null = chips.mv && {
    kind: 'number',
    field: 'mv',
    op: chips.mv.op,
    value: chips.mv.value,
  };
  let colors: QueryNode | null = null;
  if (chips.colorless) {
    colors = { kind: 'color', field: 'color', op: '=', colors: [] };
  } else if (chips.colors.length > 0) {
    colors = {
      kind: 'color',
      field: 'color',
      op: MODE_OPS[chips.colorMode],
      colors: toColors(chips.colors),
    };
  }
  return allOf(types, subtype, mv, colors);
};

export const chipCount = (chips: Chips): number =>
  chips.types.length +
  (chips.subtype ? 1 : 0) +
  (chips.mv ? 1 : 0) +
  (chips.colorless || chips.colors.length > 0 ? 1 : 0);

// Subtypes come after the dash on each face's type line.
export const subtypesOf = (typeLines: Iterable<string>): string[] => {
  const found = new Set<string>();
  for (const line of typeLines) {
    line.split('//').forEach((face) => {
      const [, after] = face.split('—');
      after
        ?.trim()
        .split(/\s+/)
        .filter(Boolean)
        .forEach((word) => found.add(word));
    });
  }
  return [...found].sort((a, b) => a.localeCompare(b));
};
