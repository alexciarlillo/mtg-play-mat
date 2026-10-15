import type { Color } from './facts';
import type { Comparison, IsValue, QueryNode } from './parse';
import type { SearchFace, Searchable } from './searchable';

const compare = (a: number, op: Comparison, b: number): boolean => {
  switch (op) {
    case '=':
      return a === b;
    case '!=':
      return a !== b;
    case '<':
      return a < b;
    case '<=':
      return a <= b;
    case '>':
      return a > b;
    case '>=':
      return a >= b;
  }
};

const compareSets = (
  set: ReadonlySet<Color>,
  op: Comparison,
  wanted: readonly Color[]
): boolean => {
  const covers = wanted.every((color) => set.has(color));
  const within = [...set].every((color) => wanted.includes(color));
  switch (op) {
    case '=':
      return covers && within;
    case '!=':
      return !(covers && within);
    case '>=':
      return covers;
    case '<=':
      return within;
    case '>':
      return covers && !within;
    case '<':
      return within && !covers;
  }
};

// "*" counts as 0 and "1+*" as 1, as on Scryfall; "X" or "?" never match.
const statValue = (stat: string | undefined): number | null => {
  if (stat === undefined) return null;
  const leading = /^[+-]?\d+(\.\d+)?/.exec(stat);
  if (leading) return Number(leading[0]);
  return stat.includes('*') ? 0 : null;
};

const PERMANENT_TYPES = [
  'artifact',
  'creature',
  'enchantment',
  'land',
  'planeswalker',
  'battle',
];

const DFC_LAYOUTS = [
  'transform',
  'modal_dfc',
  'meld',
  'double_faced_token',
  'reversible_card',
];

const LAYOUTS: Partial<Record<IsValue, string>> = {
  mdfc: 'modal_dfc',
  transform: 'transform',
  split: 'split',
  flip: 'flip',
  adventure: 'adventure',
};

const frontType = (card: Searchable) => card.faces[0]?.typeLine ?? '';

const matchesIs = (card: Searchable, value: IsValue): boolean => {
  switch (value) {
    case 'permanent':
      return PERMANENT_TYPES.some((type) => frontType(card).includes(type));
    case 'spell':
      return !frontType(card).includes('land');
    case 'historic':
      return card.faces.some((face) =>
        /\b(artifact|legendary|saga)\b/.test(face.typeLine)
      );
    case 'dfc':
      return DFC_LAYOUTS.includes(card.layout);
    default:
      return card.layout === LAYOUTS[value];
  }
};

// The words after each dash, so "Orc" never matches "Sorcery". A ref
// without faces may still hold both halves joined by "//".
const subtypes = (typeLine: string): string[] =>
  typeLine
    .split('//')
    .flatMap((half) => half.split('—')[1]?.trim().split(' ') ?? [])
    .filter(Boolean);

const anyFace = (card: Searchable, test: (face: SearchFace) => boolean) =>
  card.faces.some(test);

const hasName = (card: Searchable, value: string) =>
  card.name.includes(value) || anyFace(card, (f) => f.name.includes(value));

// Whether the node reads anything only card facts provide.
const usesFacts = (node: QueryNode): boolean => {
  switch (node.kind) {
    case 'and':
    case 'or':
      return node.nodes.some(usesFacts);
    case 'not':
      return usesFacts(node.node);
    case 'text':
      return node.field === 'oracle' || node.field === 'keyword';
    case 'number':
      return node.field === 'mv';
    case 'color':
    case 'multicolor':
      return true;
    default:
      return false;
  }
};

// A multi-face card matches a term when any of its faces does. Terms that
// need card facts never match a card without them, even when negated.
const matchNode = (node: QueryNode, card: Searchable): boolean => {
  switch (node.kind) {
    case 'and':
      return node.nodes.every((child) => matchNode(child, card));
    case 'or':
      return node.nodes.some((child) => matchNode(child, card));
    case 'not':
      if (card.colors === null && usesFacts(node.node)) return false;
      return !matchNode(node.node, card);
    case 'exactName':
      return (
        card.name === node.value ||
        anyFace(card, (face) => face.name === node.value)
      );
    case 'text': {
      const { value } = node;
      switch (node.field) {
        case 'any':
          return (
            hasName(card, value) ||
            anyFace(
              card,
              (f) => f.typeLine.includes(value) || f.oracleText.includes(value)
            )
          );
        case 'name':
          return hasName(card, value);
        case 'type':
          return anyFace(card, (face) => face.typeLine.includes(value));
        case 'oracle':
          return anyFace(card, (face) => face.oracleText.includes(value));
        case 'keyword':
          return card.keywords?.some((kw) => kw.includes(value)) ?? false;
      }
      break;
    }
    case 'number': {
      if (node.field === 'mv') {
        return card.mv !== null && compare(card.mv, node.op, node.value);
      }
      const field = node.field;
      return anyFace(card, (face) => {
        const stat = statValue(face[field]);
        return stat !== null && compare(stat, node.op, node.value);
      });
    }
    case 'color': {
      const set = node.field === 'color' ? card.colors : card.identity;
      return set !== null && compareSets(set, node.op, node.colors);
    }
    case 'multicolor': {
      const set = node.field === 'color' ? card.colors : card.identity;
      return set !== null && set.size >= 2;
    }
    case 'is':
      return matchesIs(card, node.value);
    case 'subtype':
      return anyFace(card, (face) =>
        subtypes(face.typeLine).includes(node.value)
      );
  }
};

// A null query (empty, or nothing valid in it) matches every card.
export const matchesQuery = (
  node: QueryNode | null,
  card: Searchable
): boolean => node === null || matchNode(node, card);
