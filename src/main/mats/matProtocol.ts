import { readFile } from 'node:fs/promises';

import { MAT_CONTENT_TYPE, MAT_SCHEME, parseMatImageUrl } from '@shared/mat';

import { getErrorMessage } from '../util';
import type MatStore from './MatStore';

// Must run before app 'ready'. "standard" gives mat:// URLs a host (the
// mat's id) and "secure" lets pages under a strict CSP load them.
export const matSchemePrivileges = {
  scheme: MAT_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true },
};

// Serves play area backgrounds from the store. A mat is named by the
// hash of its bytes, so it can be cached forever.
export const createMatImageHandler =
  (mats: MatStore) =>
  async (request: Request): Promise<Response> => {
    const id = parseMatImageUrl(request.url);
    if (!id) return new Response('bad mat url', { status: 400 });
    try {
      const file = await mats.displayPath(id);
      if (!file) return new Response('no such mat', { status: 404 });
      return new Response(await readFile(file), {
        headers: {
          'Content-Type': MAT_CONTENT_TYPE,
          'Cache-Control': 'max-age=31536000, immutable',
        },
      });
    } catch (err) {
      console.warn('[mat://]', getErrorMessage(err));
      return new Response('mat unavailable', { status: 500 });
    }
  };
