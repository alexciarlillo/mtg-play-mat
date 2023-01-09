import path from 'path';

import Database from 'better-sqlite3';
import { getErrorMessage } from 'main/util';

import webpackPaths from '../../../../.erb/configs/webpack.paths';

export default class DB {
  db!: Database.Database;

  name = null;

  filePath = '';

  constructor({ name, readonly, fileMustExist = true }) {
    this.name = name;

    this.filePath =
      process.env.NODE_ENV === 'development'
        ? path.join(webpackPaths.appPath, `./db/${name}.sqlite`)
        : path.join(__dirname, `../../db/${name}.sqlite`); // In prod, __dirname is release/app/dist/main. We want release/app/sql

    try {
      this.db = new Database(this.filePath, { readonly, fileMustExist });
    } catch (err) {
      console.error('[DB Load Error]', {
        message: getErrorMessage(err),
        name: this.name,
        filePath: this.filePath,
      });
    }
  }
}
