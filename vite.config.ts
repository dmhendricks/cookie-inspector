import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { crx, type ManifestV3Export } from '@crxjs/vite-plugin';
import preact from '@preact/preset-vite';
import manifest from './src/manifest.json' with { type: 'json' };

const copyLicense = {
  name: 'copy-license',
  apply: 'build' as const,
  closeBundle() {
    copyFileSync(resolve(__dirname, 'LICENSE'), resolve(__dirname, 'dist/LICENSE'));
  },
};

export default defineConfig({
  plugins: [preact(), crx({ manifest: manifest as unknown as ManifestV3Export }), copyLicense],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        panel: 'src/panel/panel.html',
      },
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.{test,spec}.{ts,tsx}'],
  },
});
