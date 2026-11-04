import { deleteAssetFiles } from '../assets/service.js';
import type { AppEnv } from '../config/env.js';
import type { AppDatabase } from '../db/client.js';
import {
  countAssetReferences,
  deleteAsset,
  type StoredAsset,
} from '../db/assets.repository.js';

/** Elimina un asset sostituito solo se nessuna riga lo referenzia più. */
export const removeUnreferencedAsset = async (
  env: AppEnv,
  db: AppDatabase,
  asset: StoredAsset,
): Promise<void> => {
  if (countAssetReferences(db, asset.id) !== 0) {
    return;
  }
  if (deleteAsset(db, asset.id)) {
    await deleteAssetFiles(env, asset);
  }
};
