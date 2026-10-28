import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  srdCatalogSchema,
  type SrdCatalog,
  type SrdCollection,
  type SrdMeta,
} from '@dnd-vtt/shared';

const HERE = dirname(fileURLToPath(import.meta.url));
const CURRENT_VERSION = 'srd-5.2.0';

const DATA_ROOTS = [
  join(HERE, 'data'),
  join(HERE, '..', 'src', 'srd', 'data'),
  join(process.cwd(), 'src', 'srd', 'data'),
  join(process.cwd(), 'server', 'src', 'srd', 'data'),
];

const resolveDataRoot = (): string => {
  const found = DATA_ROOTS.find((root) => existsSync(join(root, CURRENT_VERSION, 'meta.json')));
  if (found === undefined) {
    throw new Error('catalogo SRD non trovato: eseguire npm run srd:import');
  }
  return found;
};

const DATA_ROOT = resolveDataRoot();
const cache = new Map<string, SrdCatalog>();

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

export const availableSrdVersions = (): string[] =>
  readdirSync(DATA_ROOT)
    .filter((entry) => existsSync(join(DATA_ROOT, entry, 'meta.json')))
    .sort();

export const currentSrdVersion = (): string => CURRENT_VERSION;

export const loadSrdCatalog = (version: string): SrdCatalog => {
  const cached = cache.get(version);
  if (cached !== undefined) {
    return cached;
  }
  if (!availableSrdVersions().includes(version)) {
    throw new SrdVersionUnknownError(version);
  }
  const directory = join(DATA_ROOT, version);
  const meta = readJson<SrdMeta>(join(directory, 'meta.json'));
  const catalog = srdCatalogSchema.parse({
    meta,
    classes: readJson(join(directory, 'classes.json')),
    species: readJson(join(directory, 'species.json')),
    backgrounds: readJson(join(directory, 'backgrounds.json')),
    feats: readJson(join(directory, 'feats.json')),
    spells: readJson(join(directory, 'spells.json')),
    items: readJson(join(directory, 'items.json')),
    monsters: readJson(join(directory, 'monsters.json')),
  });
  cache.set(version, catalog);
  return catalog;
};

export const loadSrdCollection = <K extends SrdCollection>(
  version: string,
  collection: K,
): SrdCatalog[K] => loadSrdCatalog(version)[collection];

export class SrdVersionUnknownError extends Error {
  public readonly version: string;

  public constructor(version: string) {
    super(`Versione SRD sconosciuta: ${version}`);
    this.name = 'SrdVersionUnknownError';
    this.version = version;
  }
}
