import { type Color, toColors } from './facts';
import { fold } from './searchable';

export type Comparison = '=' | '!=' | '<' | '<=' | '>' | '>=';
export type TextField = 'any' | 'name' | 'type' | 'oracle' | 'keyword';
export type NumberField = 'mv' | 'power' | 'toughness' | 'loyalty';
export type ColorField = 'color' | 'identity';

export const IS_VALUES = [
  'permanent',
  'spell',
  'historic',
  'dfc',
  'mdfc',
  'transform',
  'split',
  'flip',
  'adventure',
] as const;

export type IsValue = (typeof IS_VALUES)[number];

// Text values are folded (see fold) so matching is a plain substring test.
export type QueryNode =
  | { kind: 'and'; nodes: QueryNode[] }
  | { kind: 'or'; nodes: QueryNode[] }
  | { kind: 'not'; node: QueryNode }
  | { kind: 'text'; field: TextField; value: string }
  | { kind: 'exactName'; value: string }
  | { kind: 'number'; field: NumberField; op: Comparison; value: number }
  | { kind: 'color'; field: ColorField; op: Comparison; colors: Color[] }
  | { kind: 'multicolor'; field: ColorField }
  | { kind: 'is'; value: IsValue };

export interface QueryError {
  message: string;
  // Offsets into the query text, end exclusive.
  start: number;
  end: number;
}

// A null node matches every card. Terms with errors are left out, so a
// half-typed query still filters on the parts that make sense.
export interface ParsedQuery {
  node: QueryNode | null;
  errors: QueryError[];
}

type Key =
  | { kind: 'text'; field: Exclude<TextField, 'any'> }
  | { kind: 'number'; field: NumberField }
  | { kind: 'color'; field: ColorField }
  | { kind: 'is' };

const keys: Record<string, Key> = {
  t: { kind: 'text', field: 'type' },
  type: { kind: 'text', field: 'type' },
  o: { kind: 'text', field: 'oracle' },
  oracle: { kind: 'text', field: 'oracle' },
  kw: { kind: 'text', field: 'keyword' },
  keyword: { kind: 'text', field: 'keyword' },
  n: { kind: 'text', field: 'name' },
  name: { kind: 'text', field: 'name' },
  mv: { kind: 'number', field: 'mv' },
  cmc: { kind: 'number', field: 'mv' },
  manavalue: { kind: 'number', field: 'mv' },
  pow: { kind: 'number', field: 'power' },
  power: { kind: 'number', field: 'power' },
  tou: { kind: 'number', field: 'toughness' },
  toughness: { kind: 'number', field: 'toughness' },
  loy: { kind: 'number', field: 'loyalty' },
  loyalty: { kind: 'number', field: 'loyalty' },
  c: { kind: 'color', field: 'color' },
  color: { kind: 'color', field: 'color' },
  colour: { kind: 'color', field: 'color' },
  id: { kind: 'color', field: 'identity' },
  ci: { kind: 'color', field: 'identity' },
  identity: { kind: 'color', field: 'identity' },
  is: { kind: 'is' },
};

const colorNames: Record<string, string> = {
  white: 'w',
  blue: 'u',
  black: 'b',
  red: 'r',
  green: 'g',
  azorius: 'wu',
  dimir: 'ub',
  rakdos: 'br',
  gruul: 'rg',
  selesnya: 'gw',
  orzhov: 'wb',
  izzet: 'ur',
  golgari: 'bg',
  boros: 'rw',
  simic: 'gu',
  bant: 'gwu',
  esper: 'wub',
  grixis: 'ubr',
  jund: 'brg',
  naya: 'rgw',
  abzan: 'wbg',
  jeskai: 'urw',
  sultai: 'bgu',
  mardu: 'rwb',
  temur: 'gur',
  c: '',
  colorless: '',
  colourless: '',
};

const multicolorNames = ['m', 'multicolor', 'multicolored', 'gold'];

const OP = /^([a-z]+)(!=|<=|>=|:|=|<|>)/i;

const isSpace = (ch: string | undefined) => ch !== undefined && /\s/.test(ch);

const combine = (
  kind: 'and' | 'or',
  parts: (QueryNode | null)[]
): QueryNode | null => {
  const nodes = parts.flatMap((node): QueryNode[] => {
    if (node === null) return [];
    return (node.kind === 'and' || node.kind === 'or') && node.kind === kind
      ? node.nodes
      : [node];
  });
  if (nodes.length <= 1) return nodes[0] ?? null;
  return { kind, nodes };
};

class Parser {
  private pos = 0;
  readonly errors: QueryError[] = [];

  private readonly src: string;

  // Curly quotes become straight ones; the length stays, so offsets hold.
  constructor(text: string) {
    this.src = text.replace(/[“”]/g, '"');
  }

  parse(): QueryNode | null {
    return this.parseOr(0);
  }

  private error(message: string, start: number, end = this.pos) {
    this.errors.push({ message, start, end: Math.max(end, start + 1) });
  }

  // A method, not a getter, so TypeScript doesn't narrow it across moves.
  private char(): string | undefined {
    return this.src[this.pos];
  }

  private skipSpace() {
    while (isSpace(this.char())) this.pos += 1;
  }

  // "or" and "and" count only as whole words, so "orc" is a search term.
  private atWord(word: string): boolean {
    const end = this.pos + word.length;
    if (this.src.slice(this.pos, end).toLowerCase() !== word) return false;
    const next = this.src[end];
    return next === undefined || isSpace(next) || next === '(' || next === ')';
  }

  private parseOr(depth: number): QueryNode | null {
    const branches = [this.parseAnd(depth)];
    while (this.atWord('or')) {
      const start = this.pos;
      this.pos += 2;
      const branch = this.parseAnd(depth);
      if (branch === null) this.error("Nothing after 'or'", start);
      if (branches.length === 1 && branches[0] === null) {
        this.error("Nothing before 'or'", start, start + 2);
      }
      branches.push(branch);
    }
    return combine('or', branches);
  }

  private parseAnd(depth: number): QueryNode | null {
    const parts: (QueryNode | null)[] = [];
    for (;;) {
      this.skipSpace();
      if (this.char() === undefined || this.atWord('or')) break;
      if (this.char() === ')') {
        if (depth > 0) break;
        this.error("Unmatched ')'", this.pos, this.pos + 1);
        this.pos += 1;
        continue;
      }
      if (this.atWord('and')) {
        this.pos += 3;
        continue;
      }
      parts.push(this.parseUnary(depth));
    }
    return combine('and', parts);
  }

  private parseUnary(depth: number): QueryNode | null {
    const start = this.pos;
    if (this.char() === '-') {
      this.pos += 1;
      const next = this.char();
      if (next === undefined || isSpace(next) || next === ')') {
        this.error("Nothing to exclude after '-'", start);
        return null;
      }
      const inner = this.parseUnary(depth);
      return inner && { kind: 'not', node: inner };
    }
    if (this.char() === '(') {
      this.pos += 1;
      const inner = this.parseOr(depth + 1);
      this.skipSpace();
      if (this.char() === ')') {
        this.pos += 1;
        if (inner === null) this.error('Empty parentheses', start);
      } else {
        this.error("Missing ')'", start, start + 1);
      }
      return inner;
    }
    return this.parseTerm();
  }

  private readQuoted(): string {
    const start = this.pos;
    const close = this.src.indexOf('"', start + 1);
    if (close === -1) {
      this.pos = this.src.length;
      this.error('Missing closing quote', start);
      return this.src.slice(start + 1);
    }
    this.pos = close + 1;
    return this.src.slice(start + 1, close);
  }

  private readWord(): string {
    const start = this.pos;
    for (let ch = this.char(); ch !== undefined; ch = this.char()) {
      if (isSpace(ch) || ch === '(' || ch === ')') break;
      this.pos += 1;
    }
    return this.src.slice(start, this.pos);
  }

  private readValue(): string {
    return this.char() === '"' ? this.readQuoted() : this.readWord();
  }

  private parseTerm(): QueryNode | null {
    const start = this.pos;
    if (this.char() === '!') {
      this.pos += 1;
      const value = fold(this.readValue());
      if (value === '') {
        this.error("A card name goes after '!'", start);
        return null;
      }
      return { kind: 'exactName', value };
    }
    const op = this.char() === '"' ? null : OP.exec(this.src.slice(this.pos));
    if (!op) {
      const value = fold(this.readValue());
      return value === '' ? null : { kind: 'text', field: 'any', value };
    }
    const [whole, rawKey = '', rawOp = ''] = op;
    this.pos += whole.length;
    const value = this.readValue();
    const end = this.pos;
    const name = rawKey.toLowerCase();
    const key = keys[name];
    if (!key) {
      this.error(`Unknown keyword '${rawKey}'`, start, start + rawKey.length);
      return null;
    }
    if (fold(value) === '') {
      this.error(`A value goes after '${rawKey}${rawOp}'`, start, end);
      return null;
    }
    const term = this.build(key, name, rawOp as Comparison | ':', value);
    if (typeof term === 'string') {
      this.error(term, start, end);
      return null;
    }
    return term;
  }

  // Returns an error message when the term can't be built.
  private build(
    key: Key,
    name: string,
    rawOp: Comparison | ':',
    raw: string
  ): QueryNode | string {
    const value = fold(raw);
    const equality = rawOp === ':' || rawOp === '=';
    switch (key.kind) {
      case 'text':
        if (!equality) return `'${name}' only takes ':'`;
        return { kind: 'text', field: key.field, value };
      case 'is':
        if (!equality) return `'is' only takes ':'`;
        if (!(IS_VALUES as readonly string[]).includes(value)) {
          return `Unknown 'is:' value '${raw}'`;
        }
        return { kind: 'is', value: value as IsValue };
      case 'number': {
        if (!/^-?\d+(\.\d+)?$/.test(value)) return `'${name}' needs a number`;
        const number = Number(value);
        const op = rawOp === ':' ? '=' : rawOp;
        return { kind: 'number', field: key.field, op, value: number };
      }
      case 'color':
        return colorTerm(key.field, rawOp, value, raw);
    }
  }
}

// Scryfall semantics: c: means "at least these colours" and id: means
// "fits within this identity". c:c and id:c both mean colourless.
const colorTerm = (
  field: ColorField,
  rawOp: Comparison | ':',
  value: string,
  raw: string
): QueryNode | string => {
  if (multicolorNames.includes(value)) {
    const node: QueryNode = { kind: 'multicolor', field };
    if (rawOp === ':' || rawOp === '=') return node;
    if (rawOp === '!=') return { kind: 'not', node };
    return `'${raw}' only takes ':'`;
  }
  const letters = colorNames[value] ?? value;
  if (!/^[wubrg]*$/.test(letters)) return `Unknown colour '${raw}'`;
  const colors = toColors(letters.split(''));
  let op: Comparison;
  if (rawOp !== ':') op = rawOp;
  else if (colors.length === 0) op = '=';
  else op = field === 'color' ? '>=' : '<=';
  return { kind: 'color', field, op, colors };
};

export const parseQuery = (text: string): ParsedQuery => {
  const parser = new Parser(text);
  const node = parser.parse();
  return { node, errors: parser.errors };
};
