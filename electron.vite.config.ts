import { resolve } from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

const sharedAlias = { '@shared': resolve('src/shared') };

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
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          app: resolve('src/renderer/app.html'),
          board: resolve('src/renderer/board.html'),
          hand: resolve('src/renderer/hand.html'),
        },
      },
    },
  },
});
