import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  // In watch non si pulisce `dist`: Angular legge i tipi mentre tsup
  // riscrive gli artefatti, e un dist vuoto per pochi ms produce TS7006.
  clean: false,
  sourcemap: true,
  target: 'node24',
});
