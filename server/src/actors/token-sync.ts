import { newId, sceneStateSchema, type PcStatblock } from '@dnd-vtt/shared';
import { sql } from 'drizzle-orm';
import { applySceneActionTx } from '../actions/service.js';
import type { Transaction } from '../db/client.js';
import { sameHp } from './actor-sync.js';

interface SceneCandidate {
  id: string;
  state: string;
}

const conditionsEqual = (
  left: PcStatblock['conditions'],
  right: PcStatblock['conditions'],
): boolean => JSON.stringify(left) === JSON.stringify(right);

const isJson1Unavailable = (error: unknown): boolean =>
  error instanceof Error && /no such (table|function): json_/i.test(error.message);

const escapeLikePattern = (value: string): string => value.replace(/[\\%_]/g, (char) => `\\${char}`);

/**
 * Prefiltro JSON1: restituisce solo le scene la cui `state.tokens` contiene un
 * token con `actorId`. `json_valid` evita che una riga corrotta faccia fallire
 * l'intera query (le righe non valide non possono contenere token leggibili).
 */
const selectScenesWithActorJson1 = (
  tx: Transaction,
  campaignId: string,
  actorId: string,
): SceneCandidate[] => tx.all<SceneCandidate>(sql`
  SELECT id, state FROM scenes
  WHERE campaign_id = ${campaignId}
    AND json_valid(state)
    AND EXISTS (
      SELECT 1
      FROM json_each(
        CASE WHEN json_valid(scenes.state) THEN scenes.state ELSE '{"tokens":[]}' END,
        '$.tokens'
      ) AS token
      WHERE json_extract(token.value, '$.actorId') = ${actorId}
    )
  ORDER BY created_at, id
`);

/**
 * Fallback per build SQLite senza JSON1: cerca l'`actorId` come sottostringa
 * con `LIKE` (wildcard escapate). È un prefiltro conservativo: qualche scena
 * in più può essere letta, ma il controllo `token.actorId` a valle resta la
 * fonte di verità, quindi il risultato non cambia.
 */
const selectScenesWithActorLike = (
  tx: Transaction,
  campaignId: string,
  actorId: string,
): SceneCandidate[] => tx.all<SceneCandidate>(sql`
  SELECT id, state FROM scenes
  WHERE campaign_id = ${campaignId}
    AND state LIKE ${`%${escapeLikePattern(actorId)}%`} ESCAPE '\\'
  ORDER BY created_at, id
`);

const selectSceneCandidates = (
  tx: Transaction,
  campaignId: string,
  actorId: string,
): SceneCandidate[] => {
  try {
    return selectScenesWithActorJson1(tx, campaignId, actorId);
  } catch (error) {
    if (!isJson1Unavailable(error)) {
      throw error;
    }
    return selectScenesWithActorLike(tx, campaignId, actorId);
  }
};

/**
 * Dopo una modifica alla scheda (riposo, level-up, patch DM) rispecchia HP e
 * condizioni sui token dell'attore nelle scene della campagna che lo contengono.
 * Ogni token da aggiornare produce un'azione `token.update` nella stessa
 * transazione, così l'undo copre anche la sincronizzazione.
 */
export const updateTokensForActor = (
  tx: Transaction,
  campaignId: string,
  actorId: string,
  statblock: PcStatblock,
  origin: 'dm' | 'player',
): void => {
  if (campaignId === '') {
    return;
  }
  const rows = selectSceneCandidates(tx, campaignId, actorId);
  for (const row of rows) {
    const state = sceneStateSchema.parse(JSON.parse(row.state) as unknown);
    for (const token of state.tokens) {
      if (token.actorId !== actorId) {
        continue;
      }
      if (sameHp(token.hp, statblock.hp) && conditionsEqual(token.conditions, statblock.conditions)) {
        continue;
      }
      applySceneActionTx(tx, {
        campaignId,
        request: {
          id: newId(),
          clientId: 'token-sync',
          sceneId: row.id,
          action: {
            type: 'token.update',
            tokenId: token.id,
            patch: { hp: statblock.hp, conditions: statblock.conditions },
          },
        },
        origin,
        actorId,
      });
    }
  }
};
