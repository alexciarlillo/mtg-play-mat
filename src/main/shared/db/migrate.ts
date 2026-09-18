import type { DatabaseSync } from 'node:sqlite';

// Each migration runs once, in order; its 1-based index becomes the
// database's user_version. Never edit or reorder a shipped migration.
export type Migration = string | ((db: DatabaseSync) => void);

export const userVersion = (db: DatabaseSync): number =>
  Number(db.prepare('PRAGMA user_version').get()?.user_version ?? 0);

export const transaction = <T>(db: DatabaseSync, fn: () => T): T => {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
};

// Returns the resulting version. A database written by a newer app is
// refused rather than guessed at.
export const migrate = (db: DatabaseSync, migrations: Migration[]): number => {
  const current = userVersion(db);
  if (current > migrations.length) {
    throw new Error(
      `database version ${current} is newer than this app (${migrations.length})`
    );
  }

  migrations.slice(current).forEach((migration, offset) => {
    const version = current + offset + 1;
    transaction(db, () => {
      if (typeof migration === 'string') db.exec(migration);
      else migration(db);
      db.exec(`PRAGMA user_version = ${version}`);
    });
  });

  return migrations.length;
};
