import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  _electron as electron,
  type ElectronApplication,
  expect,
  type Page,
  test,
} from '@playwright/test';

import { FIXTURE_CARDS, startFakeScryfall } from './fakeScryfall';

const PROVISIONER = 'a1e048e0-19d2-4076-892d-f8b3104dee37';

const appWindow = async (app: ElectronApplication): Promise<Page> => {
  await expect
    .poll(() => app.windows().some((w) => w.url().includes('app.html')))
    .toBe(true);
  const page = app.windows().find((w) => w.url().includes('app.html'))!;
  await page.waitForLoadState('load');
  return page;
};

// A card database from before related tokens existed is upgraded in
// place, keeps working, and is downloaded again even though Scryfall has
// nothing newer.
test('an older card database is refreshed for related tokens', async () => {
  const scryfall = await startFakeScryfall();
  const userDataDir = mkdtempSync(
    path.join(tmpdir(), 'mtg-play-mat-e2e-refresh-')
  );
  const launch = () =>
    electron.launch({
      args: ['.', `--user-data-dir=${userDataDir}`],
      env: {
        ...process.env,
        MTG_PLAY_MAT_TEST_HOOKS: '1',
        MTG_PLAY_MAT_BULK_DATA_URL: scryfall.bulkDataUrl,
      },
    });
  const errors: string[] = [];

  try {
    let app = await launch();
    let page = await appWindow(app);
    const status = page.getByTestId('card-data-status');
    await expect(status).toContainText(`(${FIXTURE_CARDS} cards)`);
    const first = await page.evaluate(() => window.api.getCardDataStatus());
    await app.close();

    // Turn the file back into the previous schema version.
    const dbPath = path.join(userDataDir, 'db', 'cards.sqlite');
    const db = new DatabaseSync(dbPath);
    db.exec('DROP TABLE related_parts; PRAGMA user_version = 2;');
    db.close();

    // With no update check (as offline), the old file is upgraded in place
    // and keeps working; it just has no related tokens yet.
    const offline = await electron.launch({
      args: ['.', `--user-data-dir=${userDataDir}`],
      env: { ...process.env, MTG_PLAY_MAT_TEST_HOOKS: '1' },
    });
    page = await appWindow(offline);
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await expect(page.getByTestId('card-data-status')).toContainText(
      'update to add deck tokens'
    );
    expect(
      await page.evaluate((id) => window.api.relatedTokens([id]), PROVISIONER)
    ).toEqual({});
    expect(
      (await page.evaluate(() => window.api.searchTokens('treasure'))).length
    ).toBeGreaterThan(0);
    await offline.close();

    // Online again: the same Scryfall data is downloaded once more.
    app = await launch();
    page = await appWindow(app);
    await expect(page.getByTestId('card-data-status')).not.toContainText(
      'update to add deck tokens'
    );
    await expect(page.getByTestId('card-data-status')).toHaveAttribute(
      'data-phase',
      'idle'
    );
    const after = await page.evaluate(() => window.api.getCardDataStatus());
    expect(after.local?.needsRefresh).toBeUndefined();
    expect(after.local?.sourceUpdatedAt).toBe(first.local?.sourceUpdatedAt);
    expect(after.local?.ingestedAt).not.toBe(first.local?.ingestedAt);
    const related = await page.evaluate(
      (id) => window.api.relatedTokens([id]),
      PROVISIONER
    );
    expect(related[PROVISIONER]?.map((t) => t.ref.name)).toEqual([
      'Food',
      'Treasure',
    ]);
    await app.close();
    expect(errors).toEqual([]);
  } finally {
    scryfall.close();
    rmSync(userDataDir, { recursive: true, force: true });
  }
});
