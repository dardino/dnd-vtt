import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Verifica esplicita degli entry point che l'immagine Docker esegue. Non fa
// parte di `npm test`: gira dopo il build (Dockerfile e `npm run check`).
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const expected = [
  'dist/index.js',
  'dist/db/migrate-cli.js',
  'dist/db/seed-cli.js',
];

const missing = expected.filter((relative) => {
  const path = join(packageRoot, relative);
  return !existsSync(path) || statSync(path).size === 0;
});

if (missing.length > 0) {
  globalThis.process.stderr.write(
    `Bundle server incompleti: ${missing.join(', ')}. Eseguire npm run build -w @dnd-vtt/server.\n`,
  );
  globalThis.process.exit(1);
}

globalThis.process.stdout.write(`Bundle server OK: ${expected.join(', ')}\n`);
