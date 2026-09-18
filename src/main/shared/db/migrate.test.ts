// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';

import { describe, expect, it } from 'vitest';

import { migrate, userVersion } from './migrate';

const tables = (db: DatabaseSync) =>
  (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
      name: string;
    }[]
  )
    .map((row) => row.name)
    .sort();

describe('migrate', () => {
  it('applies pending migrations in order and records the version', () => {
    const db = new DatabaseSync(':memory:');
    const version = migrate(db, [
      'CREATE TABLE a (id INTEGER)',
      (d) => d.exec('CREATE TABLE b (id INTEGER)'),
    ]);

    expect(version).toBe(2);
    expect(userVersion(db)).toBe(2);
    expect(tables(db)).toEqual(['a', 'b']);
  });

  it('only runs migrations newer than the stored version', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db, ['CREATE TABLE a (id INTEGER)']);
    migrate(db, ['CREATE TABLE a (id INTEGER)', 'CREATE TABLE c (id INTEGER)']);

    expect(userVersion(db)).toBe(2);
    expect(tables(db)).toEqual(['a', 'c']);
  });

  it('rolls back a failing migration and keeps the previous version', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db, ['CREATE TABLE a (id INTEGER)']);

    expect(() =>
      migrate(db, [
        'CREATE TABLE a (id INTEGER)',
        'CREATE TABLE d (id INTEGER); INSERT INTO nope VALUES (1)',
      ])
    ).toThrow();
    expect(userVersion(db)).toBe(1);
    expect(tables(db)).toEqual(['a']);
  });

  it('refuses a database from a newer app version', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA user_version = 5');
    expect(() => migrate(db, ['SELECT 1'])).toThrow(/newer than this app/);
  });
});
