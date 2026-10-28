import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  clean: true,
  sourcemap: true,
  target: 'node24',
  noExternal: ['@dnd-vtt/shared'],
  onSuccess: 'node scripts/copy-srd.mjs',
});
