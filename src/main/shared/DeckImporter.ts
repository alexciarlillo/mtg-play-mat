import fs from 'node:fs';

import type { CardRow } from '@shared/types/cards';

import type CardDB from './db/CardDB';

export interface ParsedLine {
  count: number;
  name: string;
  setCode?: string;
  number: string | null;
}

export default class DeckImporter {
  cardDb: CardDB;

  constructor({ cardDb }: { cardDb: CardDB }) {
    this.cardDb = cardDb;
  }

  importFromFile = ({ filePath }: { filePath: string }) => {
    const contents = fs.readFileSync(filePath).toString();
    return this.importFromString({ string: contents });
  };

  importFromString = ({ string }: { string: string }): CardRow[] => {
    const lines = string.split('\n');

    return lines
      .map((line) => DeckImporter.ParseLine(line))
      .map(({ count, name, setCode, number }) => {
        const result = this.cardDb.getCard({ name, setCode, number });
        const copies = Number.isInteger(count) && count > 0 ? count : 0;
        return Array<CardRow | undefined>(copies).fill(result);
      })
      .flat()
      .filter((card): card is CardRow => Boolean(card));
  };

  static ParseLine(line: string): ParsedLine {
    const setCodeRegex = /(\(|\[)([a-zA-Z0-9]+)(\)|\])/;

    const fields = line.split(' ');
    const count = Number(fields[0]);
    let number: string | null = null;
    let setCode: string | undefined;
    const nameArray: string[] = [];

    let fieldIndex = 1;
    for (; fieldIndex < fields.length; fieldIndex += 1) {
      const found = fields[fieldIndex].match(setCodeRegex);
      if (found) {
        [, , setCode] = found;
        break;
      } else {
        nameArray.push(fields[fieldIndex]);
      }
    }

    const name = nameArray.join(' ');

    if (fieldIndex < fields.length) {
      const numberField = fields[fieldIndex + 1];
      if (numberField !== undefined && numberField.trim() !== '') {
        number = numberField.trim();
      }
    }

    return { count, name, setCode, number };
  }
}
