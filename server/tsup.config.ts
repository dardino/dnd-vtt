import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'db/migrate-cli': 'src/db/migrate-cli.ts',
    'db/seed-cli': 'src/db/seed-cli.ts',
  },
  format: ['esm'],
  clean: true,
  sourcemap: true,
  target: 'node24',
  noExternal: ['@dnd-vtt/shared'],
  onSuccess: 'node scripts/copy-srd.mjs',
});
