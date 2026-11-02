import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import {
  createDefaultSceneState,
  defaultGridConfig,
  type FogOp,
  type GameAction,
  type SceneState,
  type TokenState,
} from '@dnd-vtt/shared';
import { v7 as uuidv7 } from 'uuid';
import { applySceneAction } from '../src/actions/service.js';
import { insertCampaign } from '../src/db/campaigns.repository.js';
import { createDatabase, type DatabaseHandle } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrations.js';
import { insertScene } from '../src/db/scenes.repository.js';

const TOKEN_COUNT = 1000;
const FOG_OPS = 2000;
const WARMUP = 5;
const SAMPLES = 30;
const CLIENT_ID = 'bench-scene-action';

interface Stats {
  min: number;
  median: number;
  max: number;
}

const makeToken = (index: number): TokenState => ({
  id: `token-${index}`,
  label: `Token ${index}`,
  x: (index % 100) * 70,
  y: Math.floor(index / 100) * 70,
  size: 1,
  rotation: 0,
  elevation: 0,
  hp: { current: 10, max: 10, temp: 0 },
  conditions: [],
  visible: true,
});

const makeFogOp = (index: number): FogOp => ({
  id: `fog-${index}`,
  op: 'reveal',
  shape: {
    type: 'rect',
    x: (index % 100) * 70,
    y: Math.floor(index / 100) * 70,
    width: 70,
    height: 70,
  },
  softness: 0,
});

const buildState = (): SceneState => {
  const state = createDefaultSceneState();
  state.tokens = Array.from({ length: TOKEN_COUNT }, (_, index) => makeToken(index));
  state.fog.ops = Array.from({ length: FOG_OPS }, (_, index) => makeFogOp(index));
  return state;
};

const median = (sorted: readonly number[]): number => {
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
  }
  return sorted[middle] ?? 0;
};

const stats = (samples: readonly number[]): Stats => {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    min: sorted[0] ?? 0,
    median: median(sorted),
    max: sorted[sorted.length - 1] ?? 0,
  };
};

const format = (value: number): string => value.toFixed(2);

const stateBytes = (handle: DatabaseHandle, sceneId: string): number => {
  const row = handle.sqlite
    .prepare('SELECT length(state) AS bytes FROM scenes WHERE id = ?')
    .get(sceneId) as { bytes: number } | undefined;
  return row?.bytes ?? 0;
};

const measure = (
  handle: DatabaseHandle,
  campaignId: string,
  sceneId: string,
  action: () => GameAction,
): Stats => {
  const apply = (): void => {
    applySceneAction(handle.db, {
      campaignId,
      request: { id: uuidv7(), clientId: CLIENT_ID, sceneId, action: action() },
      origin: 'dm',
      actorId: null,
    });
  };
  for (let index = 0; index < WARMUP; index += 1) {
    apply();
  }
  const samples: number[] = [];
  for (let index = 0; index < SAMPLES; index += 1) {
    const started = performance.now();
    apply();
    samples.push(performance.now() - started);
  }
  return stats(samples);
};

const report = (label: string, result: Stats): void => {
  const line = `${label}: min ${format(result.min)} ms · median ${format(result.median)} ms`
    + ` · max ${format(result.max)} ms\n`;
  process.stdout.write(line);
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tempDir = mkdtempSync(join(tmpdir(), 'dnd-vtt-bench-'));
const handle = createDatabase(join(tempDir, 'bench.db'));

try {
  runMigrations(handle, resolve(repoRoot, 'drizzle'));
  const campaign = insertCampaign(handle.db, {
    name: 'Benchmark scene action',
    description: '',
    fogDefault: 'hidden',
    advancementMode: 'milestone',
  });
  const scene = insertScene(handle.db, campaign.id, {
    name: 'Benchmark',
    widthPx: 7000,
    heightPx: 700,
  }, buildState());

  const initialBytes = stateBytes(handle, scene.id);
  const initialKiB = (initialBytes / 1024).toFixed(1);
  process.stdout.write(
    `Stato iniziale: ${TOKEN_COUNT} token · ${FOG_OPS} fog ops · ${initialKiB} KiB JSON\n`,
  );

  const tokenUpdate = measure(handle, campaign.id, scene.id, () => ({
    type: 'token.update',
    tokenId: 'token-0',
    patch: { label: 'Token aggiornato' },
  }));
  report('token.update', tokenUpdate);

  const gridUpdate = measure(handle, campaign.id, scene.id, () => ({
    type: 'grid.update',
    grid: { ...defaultGridConfig },
  }));
  report('grid.update', gridUpdate);

  const finalBytes = stateBytes(handle, scene.id);
  process.stdout.write(`Stato finale: ${(finalBytes / 1024).toFixed(1)} KiB JSON\n`);
} finally {
  handle.close();
  rmSync(tempDir, { recursive: true, force: true });
}
