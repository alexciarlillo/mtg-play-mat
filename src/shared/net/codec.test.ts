// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  CodeError,
  extractCode,
  findJoinLink,
  joinLink,
  lobbyLink,
  packDescription,
  parseJoinLink,
  parseLobbyLink,
  unpackDescription,
} from './codec';

const sdp = [
  'v=0',
  'o=- 4611731400430051336 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=candidate:1 1 udp 2122260223 192.168.1.20 54321 typ host',
  'a=fingerprint:sha-256 AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89',
  '',
].join('\r\n');

const plainCode = (json: string) =>
  `MPM0:${btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;

describe('invite codes', () => {
  it('round-trips a description through a compressed base64url code', async () => {
    const code = await packDescription({ type: 'offer', sdp });
    expect(code).toMatch(/^MPM1:[A-Za-z0-9_-]+$/);
    await expect(unpackDescription(code)).resolves.toEqual({
      type: 'offer',
      sdp,
    });
  });

  it('reads the uncompressed MPM0 form', async () => {
    const code = plainCode(JSON.stringify({ t: 'answer', s: sdp }));
    await expect(unpackDescription(code)).resolves.toEqual({
      type: 'answer',
      sdp,
    });
  });

  it('survives whitespace and line breaks from chat apps', async () => {
    const code = await packDescription({ type: 'answer', sdp });
    const mangled = `  ${code.slice(0, 20)}\n${code.slice(20)} \n`;
    await expect(unpackDescription(mangled)).resolves.toMatchObject({
      type: 'answer',
    });
  });

  it('accepts a pasted join link', async () => {
    const code = await packDescription({ type: 'offer', sdp });
    const link = joinLink(code);
    expect(link.startsWith('mtgplaymat://join?c=MPM1:')).toBe(true);
    expect(parseJoinLink(link)).toBe(code);
    expect(extractCode(link)).toBe(code);
    await expect(unpackDescription(link)).resolves.toMatchObject({
      type: 'offer',
    });
  });

  it.each([
    ['', /Paste the code/],
    ['hello there', /should start with MPM1/],
    ['WC1:abcd', /should start with MPM1/],
    ['MPM1:abc+/=', /should start with MPM1/],
    ['MPM1:AAAAAAAA', /damaged or cut off/],
    [plainCode('not json'), /damaged or cut off/],
    [plainCode(JSON.stringify({ t: 'offer' })), /incomplete/],
    [plainCode(JSON.stringify({ t: 'pranswer', s: 'x' })), /incomplete/],
    [`MPM0:${'A'.repeat(70_000)}`, /too long/],
  ])('rejects %j with a friendly error', async (input, message) => {
    const result = unpackDescription(input);
    await expect(result).rejects.toBeInstanceOf(CodeError);
    await expect(result).rejects.toThrow(message);
  });

  it('rejects a truncated compressed code', async () => {
    const code = await packDescription({ type: 'offer', sdp });
    await expect(
      unpackDescription(code.slice(0, code.length / 2))
    ).rejects.toThrow(/damaged or cut off/);
  });
});

describe('join links', () => {
  it('finds a join link among launch arguments', () => {
    const argv = [
      '/app/MTG Play Mat',
      '--flag',
      'mtgplaymat://join?c=MPM1:abc',
    ];
    expect(findJoinLink(argv)).toBe('mtgplaymat://join?c=MPM1:abc');
    expect(findJoinLink(['/app', '.'])).toBeNull();
  });

  it.each([
    'https://join?c=MPM1:abc',
    'mtgplaymat://host?c=MPM1:abc',
    'mtgplaymat://join',
    'mtgplaymat://join?c=',
    'not a url',
  ])('ignores %s', (link) => {
    expect(parseJoinLink(link)).toBeNull();
  });
});

describe('lobby links', () => {
  it('round-trips a lobby code', () => {
    const link = lobbyLink('ABC123');
    expect(link).toBe('mtgplaymat://join?l=ABC123');
    expect(parseLobbyLink(link)).toBe('ABC123');
  });

  it('keeps the two kinds of link apart', () => {
    expect(parseJoinLink(lobbyLink('ABC123'))).toBeNull();
    expect(parseLobbyLink(joinLink('MPM1:abc'))).toBeNull();
  });

  it('ignores anything that is not one of ours', () => {
    [
      'https://example.com/join?l=ABC123',
      'mtgplaymat://other?l=ABC123',
      'mtgplaymat://join?l=',
      'not a url',
    ].forEach((link) => expect(parseLobbyLink(link)).toBeNull());
  });

  it('is found on the command line like an invite is', () => {
    expect(findJoinLink(['/app', '.', lobbyLink('ABC123')])).toBe(
      'mtgplaymat://join?l=ABC123'
    );
  });
});
