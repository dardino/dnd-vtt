import type { AppDatabase } from '../db/client.js';
import { getCampaign } from '../db/campaigns.repository.js';
import { endSession, getActiveSession, insertSession, listSessions } from '../db/sessions.repository.js';
import { notFound } from '../errors.js';

export const campaignSessions = (db: AppDatabase, campaignId: string) => {
  if (getCampaign(db, campaignId) === null) {
    throw notFound('Campagna non trovata');
  }
  return { items: listSessions(db, campaignId) };
};

export const startCampaignSession = (db: AppDatabase, campaignId: string) => {
  if (getCampaign(db, campaignId) === null) {
    throw notFound('Campagna non trovata');
  }
  return db.transaction((tx) => {
    const active = getActiveSession(tx, campaignId);
    return active ?? insertSession(tx, campaignId);
  });
};

export const stopCampaignSession = (db: AppDatabase, campaignId: string) => {
  const active = getActiveSession(db, campaignId);
  if (active === null) {
    throw notFound('Nessuna sessione attiva');
  }
  return db.transaction((tx) => endSession(tx, active));
};
