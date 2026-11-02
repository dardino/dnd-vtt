import {
  sceneStateSchema,
  type Display,
  type DisplayState,
  type ProgramComposition,
  type ProgramLayer,
  type ProgramState,
  type Viewport,
} from '@dnd-vtt/shared';
import type { AppDatabase } from '../db/client.js';
import { getCampaign } from '../db/campaigns.repository.js';
import {
  getDisplay,
  getDisplayByCode,
  getDisplayComposition,
  touchDisplay,
  updateDisplayComposition,
} from '../db/displays.repository.js';
import { listDiceRolls } from '../db/dice-rolls.repository.js';
import { getProgramRow, insertProgram, updateProgram } from '../db/programs.repository.js';
import { getSceneState } from '../db/scenes.repository.js';
import { AppError, notFound } from '../errors.js';
import { createProjectionContext, displayLayer } from './projection.js';

const VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

const blankLayer = (): ProgramLayer => ({
  id: 'base',
  content: { type: 'blank' },
  frame: { x: 0, y: 0, width: 1, height: 1 },
  opacity: 1,
  interactive: true,
});

export const getProgram = (db: AppDatabase, campaignId: string): { version: number; state: ProgramState } => {
  const existing = getProgramRow(db, campaignId);
  if (existing !== null) {
    return existing;
  }
  const campaign = getCampaign(db, campaignId);
  if (campaign === null) {
    throw notFound('Campagna non trovata');
  }
  const content = campaign.activeSceneId === null
    ? { type: 'blank' as const }
    : {
      type: 'map' as const,
      sceneId: campaign.activeSceneId,
      viewport: VIEWPORT,
      fog: true,
      cameraLocked: false,
    };
  const state: ProgramState = {
    base: { ...blankLayer(), content },
    overlays: [],
    hud: { dice: true, initiative: true, pointer: false },
    blackout: false,
    background: '#000000',
    updatedAt: new Date().toISOString(),
  };
  return insertProgram(db, campaignId, state);
};

export const putProgram = (
  db: AppDatabase,
  campaignId: string,
  version: number,
  state: ProgramState,
): { version: number; state: ProgramState } => {
  if (getCampaign(db, campaignId) === null) {
    throw notFound('Campagna non trovata');
  }
  const current = getProgram(db, campaignId);
  if (current.version !== version) {
    throw new AppError('state_conflict', 409, 'Il program è stato modificato altrove', {
      currentVersion: current.version,
    });
  }
  const updated = updateProgram(db, campaignId, { ...state, updatedAt: new Date().toISOString() }, version);
  if (updated === null) {
    throw new AppError('state_conflict', 409, 'Il program è stato modificato altrove');
  }
  return updated;
};

export const putDisplayComposition = (
  db: AppDatabase,
  campaignId: string,
  displayId: string,
  version: number,
  composition: ProgramComposition,
): { version: number; composition: ProgramComposition } => {
  const display = getDisplay(db, displayId);
  if (display === null || display.campaignId !== campaignId) {
    throw notFound('Schermo non trovato');
  }
  const updated = updateDisplayComposition(db, displayId, composition, version);
  if (updated === null) {
    throw new AppError('state_conflict', 409, 'Lo schermo è stato aggiornato altrove', {
      currentVersion: display.compositionVersion,
    });
  }
  return { version: updated, composition };
};

export const putDisplayViewport = (
  db: AppDatabase,
  campaignId: string,
  displayId: string,
  version: number | undefined,
  viewport: Viewport,
): { version: number; viewport: Viewport } => {
  const display = getDisplay(db, displayId);
  if (display === null || display.campaignId !== campaignId) {
    throw notFound('Schermo non trovato');
  }
  const program = getProgram(db, campaignId);
  const override = getDisplayComposition(db, displayId);
  const composition = override?.composition ?? {
    base: program.state.base,
    overlays: program.state.overlays,
  };
  const mapLayer = [composition.base, ...composition.overlays]
    .find((layer) => layer.content.type === 'map');
  if (mapLayer === undefined || mapLayer.content.type !== 'map') {
    throw new AppError('validation_error', 422, 'Lo schermo non sta proiettando una mappa');
  }
  const content = { ...mapLayer.content, viewport };
  const next = {
    base: composition.base.id === mapLayer.id
      ? { ...composition.base, content }
      : composition.base,
    overlays: composition.overlays.map((layer) =>
      layer.id === mapLayer.id ? { ...layer, content } : layer),
  };
  const updated = updateDisplayComposition(db, displayId, next, version ?? display.compositionVersion);
  if (updated === null) {
    throw new AppError('state_conflict', 409, 'Lo schermo è stato aggiornato altrove', {
      currentVersion: display.compositionVersion,
    });
  }
  return { version: updated, viewport };
};

export const projectDisplay = (db: AppDatabase, display: Display): DisplayState => {
  const campaign = getCampaign(db, display.campaignId);
  if (campaign === null) {
    throw notFound('Campagna non trovata');
  }
  const program = getProgram(db, display.campaignId);
  const override = getDisplayComposition(db, display.id);
  const composition = override?.composition ?? {
    base: program.state.base,
    overlays: program.state.overlays,
  };
  const context = createProjectionContext(db, composition);
  const base = displayLayer(db, context, composition.base);
  const overlays = composition.overlays.map((layer) => displayLayer(db, context, layer));
  const mapLayer = [composition.base, ...composition.overlays]
    .find((layer) => layer.content.type === 'map');
  let initiative: DisplayState['initiative'];
  if (mapLayer?.content.type === 'map') {
    const stored = getSceneState(db, mapLayer.content.sceneId);
    if (stored !== null) {
      const state = sceneStateSchema.parse(stored.state);
      if (state.initiative.entries.length > 0) {
        initiative = {
          active: state.initiative.active,
          round: state.initiative.round,
          turnIndex: state.initiative.turnIndex,
          entries: state.initiative.entries,
        };
      }
    }
  }
  return {
    campaign: { id: campaign.id, name: campaign.name },
    compositionVersion: display.compositionVersion,
    program: {
      hud: program.state.hud,
      blackout: program.state.blackout,
      background: program.state.background,
      updatedAt: program.state.updatedAt,
    },
    composition: { base, overlays },
    ...(initiative === undefined ? {} : { initiative }),
    rolls: listDiceRolls(db, display.campaignId, 'public').items.slice(0, 20),
  };
};

export const displayStateByCode = (
  db: AppDatabase,
  code: string,
): { display: Display; state: DisplayState } => {
  const display = getDisplayByCode(db, code);
  if (display === null) {
    throw notFound('Schermo non trovato');
  }
  touchDisplay(db, display.id);
  return { display, state: projectDisplay(db, display) };
};
