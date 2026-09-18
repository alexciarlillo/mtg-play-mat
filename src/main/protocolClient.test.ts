import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { protocolClientArgs } from './protocolClient';

const base = {
  isPackaged: true,
  execPath: '/app/MTG Play Mat.exe',
  argv: ['/app/MTG Play Mat.exe'],
  env: {},
};

describe('protocolClientArgs', () => {
  it('registers the running executable for installed builds', () => {
    expect(protocolClientArgs(base)).toEqual([]);
  });

  it('registers the double-clicked exe for portable builds', () => {
    const exe = 'C:\\Users\\me\\Downloads\\mtg-play-mat-portable.exe';
    expect(
      protocolClientArgs({
        ...base,
        execPath: 'C:\\Temp\\2abc\\MTG Play Mat.exe',
        env: { PORTABLE_EXECUTABLE_FILE: exe },
      })
    ).toEqual([exe, []]);
  });

  it('leaves unpackaged runs alone unless asked', () => {
    expect(protocolClientArgs({ ...base, isPackaged: false })).toBeNull();
  });

  it('registers electron plus the app path in dev when asked', () => {
    expect(
      protocolClientArgs({
        ...base,
        isPackaged: false,
        execPath: '/electron',
        argv: ['/electron', 'out/main/index.js'],
        env: { MTG_PLAY_MAT_REGISTER_PROTOCOL: '1' },
      })
    ).toEqual(['/electron', [path.resolve('out/main/index.js')]]);
  });
});
