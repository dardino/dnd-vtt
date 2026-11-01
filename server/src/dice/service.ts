import {
  DiceFormulaError,
  rollDice,
  sceneStateSchema,
  type DiceRoll,
  type DiceRollList,
  type DiceRollRequest,
  type DiceVisibility,
} from '@dnd-vtt/shared';
import { v7 as uuidv7 } from 'uuid';
import type { AppDatabase } from '../db/client.js';
import { getCampaign } from '../db/campaigns.repository.js';
import { insertDiceRoll, listDiceRolls as listDiceRollsRepo, pruneDiceRolls } from '../db/dice-rolls.repository.js';
import { getSceneState } from '../db/scenes.repository.js';
import { AppError, notFound } from '../errors.js';

const IDEMPOTENCY_TTL_MS = 30_000;

interface CachedRoll {
  expiresAt: number;
  roll: DiceRoll;
}

interface ResolvedToken {
  actorId: string | null;
  label: string | null;
  sceneId: string | null;
}

const resolveToken = (
  db: AppDatabase,
  campaignId: string,
  sceneId: string | undefined,
  tokenId: string | undefined,
): ResolvedToken => {
  if (tokenId === undefined) {
    return { actorId: null, label: null, sceneId: sceneId ?? null };
  }
  const campaign = getCampaign(db, campaignId);
  const effectiveSceneId = sceneId ?? campaign?.activeSceneId ?? null;
  if (effectiveSceneId === null) {
    return { actorId: null, label: null, sceneId: null };
  }
  const stored = getSceneState(db, effectiveSceneId);
  if (stored === null) {
    return { actorId: null, label: null, sceneId: effectiveSceneId };
  }
  const state = sceneStateSchema.parse(stored.state);
  const token = state.tokens.find((entry) => entry.id === tokenId);
  return {
    actorId: token?.actorId ?? null,
    label: token?.label ?? null,
    sceneId: effectiveSceneId,
  };
};

export class DiceService {
  private readonly db: AppDatabase;
  private readonly idempotency = new Map<string, CachedRoll>();

  constructor(db: AppDatabase) {
    this.db = db;
  }

  rollForDm(campaignId: string, request: DiceRollRequest): DiceRoll {
    if (getCampaign(this.db, campaignId) === null) {
      throw notFound('Campagna non trovata');
    }
    const now = Date.now();
    const idempotencyKey = request.requestId === undefined ? undefined : `${campaignId}:${request.requestId}`;
    if (idempotencyKey !== undefined) {
      const cached = this.idempotency.get(idempotencyKey);
      if (cached !== undefined && cached.expiresAt > now) {
        return cached.roll;
      }
      if (cached !== undefined) {
        this.idempotency.delete(idempotencyKey);
      }
    }
    let result;
    try {
      result = rollDice({ formula: request.formula, mode: request.mode });
    } catch (error) {
      if (error instanceof DiceFormulaError) {
        throw new AppError('validation_error', 422, error.message, { formula: request.formula });
      }
      throw error;
    }
    const token = resolveToken(this.db, campaignId, request.sceneId, request.tokenId);
    const nowIso = new Date(now).toISOString();
    const roll = this.db.transaction((tx) => insertDiceRoll(tx, {
      id: uuidv7(),
      campaignId,
      sceneId: token.sceneId,
      actorId: token.actorId,
      tokenId: request.tokenId ?? null,
      origin: 'dm',
      formula: result.formula,
      mode: result.mode,
      dice: result.dice,
      modifier: result.modifier,
      total: result.total,
      visibility: request.visibility,
      label: token.label,
      createdAt: nowIso,
    }));
    this.db.transaction((tx) => pruneDiceRolls(tx, campaignId));
    if (idempotencyKey !== undefined) {
      this.idempotency.set(idempotencyKey, { expiresAt: now + IDEMPOTENCY_TTL_MS, roll });
      for (const [key, entry] of this.idempotency) {
        if (entry.expiresAt <= now) {
          this.idempotency.delete(key);
        }
      }
    }
    return roll;
  }

  listDiceRolls(campaignId: string, visibility?: DiceVisibility): DiceRollList {
    if (getCampaign(this.db, campaignId) === null) {
      throw notFound('Campagna non trovata');
    }
    return listDiceRollsRepo(this.db, campaignId, visibility);
  }

  dispose(): void {
    this.idempotency.clear();
  }
}
