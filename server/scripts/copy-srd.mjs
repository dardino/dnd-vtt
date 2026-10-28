import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const source = join(HERE, '..', 'src', 'srd', 'data');
const destination = join(HERE, '..', 'dist', 'data');

await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
