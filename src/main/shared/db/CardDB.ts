import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import type { LocalCardData } from '@shared/types/cardData';
import type {
  CurrentSetListReturn,
  Printing,
  PrintingFace,
  SearchCardsByNameOptions,
  SearchCardsByNameRet,
} from '@shared/types/cards';

import { getErrorMessage } from '../../util';
import { CARD_SCHEMA_VERSION, metaKeys } from './cardSchema';
import { userVersion } from './migrate';

interface PrintingRow {
  id: string;
  oracle_id: string | null;
  name: string;
  lang: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  released_at: string | null;
  layout: string;
  type_line: string | null;
  mana_cost: string | null;
  cmc: number | null;
  colors: string;
  color_identity: string;
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
  defense: string | null;
  keywords: string;
  oracle_text: string | null;
  rarity: string | null;
  digital: number;
  faces: string;
}

const toPrinting = (row: PrintingRow): Printing => ({
  id: row.id,
  oracleId: row.oracle_id,
  name: row.name,
  lang: row.lang,
  setCode: row.set_code,
  setName: row.set_name,
  collectorNumber: row.collector_number,
  releasedAt: row.released_at,
  layout: row.layout,
  typeLine: row.type_line,
  manaCost: row.mana_cost,
  cmc: row.cmc,
  colors: JSON.parse(row.colors) as string[],
  colorIdentity: JSON.parse(row.color_identity) as string[],
  power: row.power,
  toughness: row.toughness,
  loyalty: row.loyalty,
  defense: row.defense,
  keywords: JSON.parse(row.keywords) as string[],
  oracleText: row.oracle_text,
  rarity: row.rarity,
  digital: row.digital === 1,
  faces: JSON.parse(row.faces) as PrintingFace[],
});

interface FindPrintingOptions {
  name: string;
  setCode?: string;
  number?: string | null;
}

const SEARCH_LIMIT = 60;

// Read-only view of the card database. The file is replaced wholesale by
// an update, so the connection can be closed and reopened around a swap.
export default class CardDB {
  private db: DatabaseSync | null = null;

  constructor(readonly filePath: string) {
    this.open();
  }

  get available(): boolean {
    return this.db !== null;
  }

  // Missing, unreadable, or outdated files all count as "no data", which
  // triggers a fresh download rather than a crash.
  open = (): boolean => {
    this.close();
    if (!existsSync(this.filePath)) return false;

    try {
      const db = new DatabaseSync(this.filePath, { readOnly: true });
      if (userVersion(db) !== CARD_SCHEMA_VERSION) {
        db.close();
        console.warn('[CardDB] schema version mismatch; needs a rebuild');
        return false;
      }
      this.db = db;
    } catch (err) {
      console.warn('[CardDB] failed to open', {
        message: getErrorMessage(err),
        filePath: this.filePath,
      });
    }
    return this.db !== null;
  };

  close = () => {
    this.db?.close();
    this.db = null;
  };

  getMeta = (): LocalCardData | null => {
    if (!this.db) return null;
    const rows = this.db.prepare('SELECT key, value FROM meta').all() as {
      key: string;
      value: string;
    }[];
    const meta = new Map(rows.map((row) => [row.key, row.value]));
    const sourceUpdatedAt = meta.get(metaKeys.sourceUpdatedAt);
    const ingestedAt = meta.get(metaKeys.ingestedAt);
    if (!sourceUpdatedAt || !ingestedAt) return null;

    return {
      sourceUpdatedAt,
      ingestedAt,
      printings: Number(meta.get(metaKeys.printings) ?? 0),
    };
  };

  getCardById = ({ id }: { id: string }): Printing | undefined => {
    if (!this.db) return undefined;
    const row = this.db
      .prepare('SELECT * FROM printings WHERE id = ?')
      .get(id) as PrintingRow | undefined;
    return row && toPrinting(row);
  };

  getFaceImage = (id: string, face: number): string | undefined => {
    if (!this.db) return undefined;
    const row = this.db
      .prepare(
        `SELECT json_extract(faces, '$[' || CAST(? AS INTEGER) || '].image') AS image
         FROM printings WHERE id = ?`
      )
      .get(face, id) as { image: string | null } | undefined;
    return row?.image ?? undefined;
  };

  // Without a set, prefers the newest paper printing of that name.
  getCard = ({
    name,
    setCode,
    number,
  }: FindPrintingOptions): Printing | undefined => {
    if (!this.db) return undefined;

    // Deck lists usually name a multi-face card by its front face only.
    const conditions = [
      "(name = ?1 COLLATE NOCASE OR name LIKE ?1 || ' // %')",
    ];
    const params: string[] = [name];
    if (setCode) {
      conditions.push('set_code = ? COLLATE NOCASE');
      params.push(setCode);
    }
    if (number) {
      conditions.push('collector_number = ?');
      params.push(number);
    }

    const row = this.db
      .prepare(
        `SELECT * FROM printings WHERE ${conditions.join(' AND ')}
         ORDER BY digital, released_at DESC LIMIT 1`
      )
      .get(...params) as PrintingRow | undefined;
    return row && toPrinting(row);
  };

  searchCardsByName = (
    options: SearchCardsByNameOptions
  ): SearchCardsByNameRet[] => {
    if (!this.db) return [];

    const conditions: string[] = [];
    const params: string[] = [];
    const keyword = options.keyword?.trim();
    if (keyword) {
      conditions.push("p.name LIKE ? ESCAPE '\\'");
      params.push(`%${keyword.replace(/[\\%_]/g, '\\$&')}%`);
    }
    if (options.setCode) {
      conditions.push('p.set_code = ? COLLATE NOCASE');
      params.push(options.setCode);
    }
    if (conditions.length === 0) return [];

    return this.db
      .prepare(
        `SELECT p.id, p.name, p.type_line AS typeLine, p.set_code AS setCode,
           p.set_name AS setName, p.collector_number AS collectorNumber,
           COALESCE(s.keyrune_code, p.set_code) AS keyruneCode
         FROM printings AS p LEFT JOIN sets AS s ON s.code = p.set_code
         WHERE ${conditions.join(' AND ')}
         ORDER BY p.name COLLATE NOCASE, p.released_at DESC
         LIMIT ${SEARCH_LIMIT}`
      )
      .all(...params) as unknown as SearchCardsByNameRet[];
  };

  getCurrentSetList = (): CurrentSetListReturn[] => {
    if (!this.db) return [];

    return this.db
      .prepare(
        `SELECT code, name, set_type AS setType, released_at AS releasedAt,
           keyrune_code AS keyruneCode, printing_count AS printingCount
         FROM sets WHERE released_at IS NULL OR released_at <= DATE()
         ORDER BY released_at DESC, name`
      )
      .all() as unknown as CurrentSetListReturn[];
  };
}
