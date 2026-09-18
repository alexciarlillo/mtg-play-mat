import path from 'node:path';

import Database from 'better-sqlite3';
import { app } from 'electron';

import { getErrorMessage } from '../../util';

interface DBOptions {
  name: string;
  readonly: boolean;
  fileMustExist?: boolean;
}

export const getDbDir = () => path.join(app.getPath('userData'), 'db');

export default class DB {
  // Null when the database file is missing or fails to open. Callers treat
  // that as "no data" so the app still starts without card data.
  db: Database.Database | null = null;

  name: string;

  filePath: string;

  constructor({ name, readonly, fileMustExist = true }: DBOptions) {
    this.name = name;
    this.filePath = path.join(getDbDir(), `${name}.sqlite`);

    try {
      this.db = new Database(this.filePath, { readonly, fileMustExist });
    } catch (err) {
      console.warn('[DB Load Error]', {
        message: getErrorMessage(err),
        name: this.name,
        filePath: this.filePath,
      });
    }
  }
}
