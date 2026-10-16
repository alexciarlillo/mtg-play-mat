import { describe, expect, it } from 'vitest';

import { moxfieldDeckUrl, parseMoxfieldUser } from './moxfield';
import { parseSettingsPatch } from './settings';

describe('parseMoxfieldUser', () => {
  it('takes a bare username', () => {
    expect(parseMoxfieldUser('  aciarlillo ')).toBe('aciarlillo');
    expect(parseMoxfieldUser('some_user-1.x')).toBe('some_user-1.x');
  });

  it('takes the username out of a profile link', () => {
    expect(parseMoxfieldUser('https://moxfield.com/users/aciarlillo')).toBe(
      'aciarlillo'
    );
    expect(
      parseMoxfieldUser('https://www.moxfield.com/users/aciarlillo/decks?x=1')
    ).toBe('aciarlillo');
    expect(parseMoxfieldUser('moxfield.com/users/Bob')).toBe('Bob');
  });

  it('refuses anything else', () => {
    [
      '',
      'two words',
      'https://evil.example/users/bob',
      'https://moxfield.com/decks/abc',
      'name/../x',
      'a'.repeat(65),
      42,
      null,
    ].forEach((input) => expect(parseMoxfieldUser(input)).toBeNull());
  });

  it('is a setting that keeps only a clean username or blank', () => {
    expect(parseSettingsPatch({ moxfieldUser: '' })).toEqual({
      moxfieldUser: '',
    });
    expect(
      parseSettingsPatch({ moxfieldUser: 'https://moxfield.com/users/bob' })
    ).toEqual({ moxfieldUser: 'bob' });
    expect(parseSettingsPatch({ moxfieldUser: 'bad name' })).toEqual({});
  });

  it('builds deck links on moxfield.com only', () => {
    expect(moxfieldDeckUrl('PtCaUR1it0O6-aGZP0Gx-A')).toBe(
      'https://moxfield.com/decks/PtCaUR1it0O6-aGZP0Gx-A'
    );
  });
});
