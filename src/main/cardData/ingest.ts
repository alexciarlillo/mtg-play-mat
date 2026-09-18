import { rmSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';

import type { CardDataProgress } from '@shared/types/cardData';

import { cardMigrations, metaKeys } from '../shared/db/cardSchema';
import { migrate, transaction } from '../shared/db/migrate';
import {
  keyruneCode,
  printingColumns,
  type ScryfallCard,
  toPrintingRecord,
} from './scryfallCard';

const BATCH_SIZE = 2000;

export interface IngestOptions {
  // Raw download bytes: gzipped JSONL, or a plain JSON/JSONL stream.
  source: AsyncIterable<Uint8Array> | Iterable<Uint8Array>;
  totalBytes: number | null;
  // A scratch path; the caller swaps it into place once this resolves.
  dbPath: string;
  sourceUpdatedAt: string;
  onProgress?(progress: CardDataProgress): void;
  now?(): Date;
}

async function* countBytes(
  source: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
  onChunk: (size: number) => void
) {
  for await (const chunk of source) {
    onChunk(chunk.byteLength);
    yield chunk;
  }
}

// fetch may or may not have already undone the gzip, so sniff the magic
// bytes instead of trusting headers or file names.
async function* maybeGunzip(
  source: AsyncIterable<Uint8Array>
): AsyncGenerator<Uint8Array | string> {
  const iterator = source[Symbol.asyncIterator]();
  const first = await iterator.next();
  if (first.done) return;

  async function* rest() {
    yield first.value;
    for (;;) {
      const next = await iterator.next();
      if (next.done) return;
      yield next.value;
    }
  }

  const head = first.value;
  if (head[0] === 0x1f && head[1] === 0x8b) {
    yield* Readable.from(rest()).pipe(createGunzip());
  } else {
    yield* rest();
  }
}

// Accepts JSONL and Scryfall's one-object-per-line JSON array format.
export const parseCardLine = (line: string): ScryfallCard | null => {
  let text = line.trim();
  if (text === '' || text === '[' || text === ']') return null;
  if (text.endsWith(',')) text = text.slice(0, -1);
  const value = JSON.parse(text) as ScryfallCard;
  return value.object === 'card' ? value : null;
};

const writeSets = (db: DatabaseSync) => {
  const sets = db
    .prepare(
      `SELECT set_code AS code, MAX(set_name) AS name, MAX(set_type) AS type,
         MIN(released_at) AS releasedAt, COUNT(*) AS count,
         MIN(digital) AS digital
       FROM printings GROUP BY set_code`
    )
    .all() as {
    code: string;
    name: string;
    type: string | null;
    releasedAt: string | null;
    count: number;
    digital: number;
  }[];

  const insert = db.prepare('INSERT INTO sets VALUES (?, ?, ?, ?, ?, ?, ?)');
  sets.forEach((set) => {
    insert.run(
      set.code,
      set.name,
      set.type,
      set.releasedAt,
      keyruneCode(set.code, set.type),
      set.count,
      set.digital
    );
  });
};

// Builds a complete card database at dbPath from a Scryfall bulk file.
// Rows are inserted in batched transactions as the download streams in.
export const ingestBulkFile = async ({
  source,
  totalBytes,
  dbPath,
  sourceUpdatedAt,
  onProgress,
  now = () => new Date(),
}: IngestOptions): Promise<{ rows: number }> => {
  rmSync(dbPath, { force: true });
  const db = new DatabaseSync(dbPath);

  try {
    // The file is scratch until it's swapped in, so durability is moot.
    db.exec('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;');
    migrate(db, cardMigrations);

    const insert = db.prepare(
      `INSERT OR REPLACE INTO printings (${printingColumns.join(', ')})
       VALUES (${printingColumns.map(() => '?').join(', ')})`
    );

    const progress: CardDataProgress = { bytes: 0, totalBytes, rows: 0 };
    const report = () => onProgress?.({ ...progress });

    let batch: ScryfallCard[] = [];
    const flush = () => {
      transaction(db, () => {
        batch.forEach((card) => {
          const record = toPrintingRecord(card);
          insert.run(...printingColumns.map((column) => record[column]));
        });
      });
      progress.rows += batch.length;
      batch = [];
      report();
    };

    const bytes = countBytes(source, (size) => {
      progress.bytes += size;
    });
    const lines = createInterface({
      input: Readable.from(maybeGunzip(bytes)),
      crlfDelay: Infinity,
    });

    for await (const line of lines) {
      const card = parseCardLine(line);
      if (card) batch.push(card);
      if (batch.length >= BATCH_SIZE) flush();
    }
    if (batch.length > 0) flush();

    if (progress.rows === 0) throw new Error('bulk file contained no cards');

    transaction(db, () => {
      writeSets(db);
      const setMeta = db.prepare('INSERT INTO meta VALUES (?, ?)');
      setMeta.run(metaKeys.sourceUpdatedAt, sourceUpdatedAt);
      setMeta.run(metaKeys.ingestedAt, now().toISOString());
      setMeta.run(metaKeys.printings, String(progress.rows));
    });

    db.exec('PRAGMA journal_mode = DELETE; PRAGMA optimize;');
    report();
    return { rows: progress.rows };
  } finally {
    db.close();
  }
};
