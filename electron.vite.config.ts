import { resolve } from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';

const sharedAlias = { '@shared': resolve('src/shared') };

const cardImageHosts = 'https://cards.scryfall.io https://svgs.scryfall.io';

// The dev server needs an inline script (React Refresh preamble), injected
// <style> tags, and a websocket for HMR. Production builds get none of it.
const contentSecurityPolicy = (dev: boolean) =>
  [
    "default-src 'self'",
    `script-src 'self'${dev ? " 'unsafe-inline'" : ''}`,
    `style-src 'self'${dev ? " 'unsafe-inline'" : ''}`,
    "font-src 'self'",
    // card: images are served by main from its on-disk cache.
    `img-src 'self' data: card: ${cardImageHosts}`,
    `connect-src 'self'${dev ? ' ws://localhost:* http://localhost:*' : ''}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');

const cspPlugin = (): Plugin => ({
  name: 'mtg-play-mat:csp',
  transformIndexHtml: (_html, ctx) => [
    {
      tag: 'meta',
      attrs: {
        'http-equiv': 'Content-Security-Policy',
        content: contentSecurityPolicy(Boolean(ctx.server)),
      },
      injectTo: 'head-prepend',
    },
  ],
});

export default defineConfig({
  main: {
    resolve: { alias: sharedAlias },
  },
  preload: {
    resolve: { alias: sharedAlias },
  },
  renderer: {
    resolve: {
      alias: { ...sharedAlias, '@renderer': resolve('src/renderer') },
    },
    plugins: [cspPlugin(), react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          app: resolve('src/renderer/app.html'),
          board: resolve('src/renderer/board.html'),
          hand: resolve('src/renderer/hand.html'),
          net: resolve('src/renderer/net.html'),
        },
      },
    },
  },
});
