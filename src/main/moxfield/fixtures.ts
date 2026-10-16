import { readFileSync } from 'node:fs';
import path from 'node:path';

// Real Moxfield responses, trimmed to a few cards per deck. The
// companion deck is the Slimefoot response with a companion that is also
// in the sideboard, as Moxfield shows an Arena-style list.
export const SATORU = 'PtCaUR1it0O6-aGZP0Gx-A';
export const SLIMEFOOT = 'gINTeyqvQkaiV4OqHFHLAw';
export const COMPANION = 'CompanionFixture000AAA';

export const readFixture = (name: string): Record<string, unknown> =>
  JSON.parse(
    readFileSync(path.join(__dirname, 'fixtures', `${name}.json`), 'utf8')
  ) as Record<string, unknown>;

export const deckFixture = (publicId: string) =>
  readFixture(`deck-${publicId}`);
