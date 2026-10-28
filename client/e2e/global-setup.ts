import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const dataDir = process.env['E2E_DATA_DIR'] ?? join(root, '.e2e', 'run');

export default (): void => {
  mkdirSync(dataDir, { recursive: true });
  execFileSync(
    process.execPath,
    [
      join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
      join(root, 'server', 'src', 'db', 'migrate-cli.ts'),
    ],
    {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: '3100',
        PUBLIC_URL: 'http://127.0.0.1:3100',
        DM_PASSWORD: '',
        SESSION_SECRET: '',
        DATABASE_PATH: join(dataDir, 'dnd.db'),
        UPLOAD_DIR: join(dataDir, 'uploads'),
      },
    },
  );
};
