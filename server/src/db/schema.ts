import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const campaigns = sqliteTable('campaigns', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  activeSceneId: text('active_scene_id'),
  fogDefault: text('fog_default', { enum: ['hidden', 'revealed'] }).notNull().default('hidden'),
  autoApprove: integer('auto_approve', { mode: 'boolean' }).notNull().default(true),
  advancementMode: text('advancement_mode', { enum: ['milestone', 'xp'] })
    .notNull()
    .default('milestone'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('campaigns_created_at_idx').on(table.createdAt, table.id),
]);

export const scenes = sqliteTable('scenes', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id')
    .notNull()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  imageAssetId: text('image_asset_id'),
  widthPx: integer('width_px').notNull(),
  heightPx: integer('height_px').notNull(),
  state: text('state').notNull(),
  stateVersion: integer('state_version').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('scenes_campaign_idx').on(table.campaignId, table.createdAt, table.id),
]);

export const actors = sqliteTable('actors', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['monster', 'npc', 'pc'] }).notNull(),
  name: text('name').notNull(),
  statblock: text('statblock').notNull(),
  rulesVersion: text('rules_version'),
  xp: integer('xp').notNull().default(0),
  sheetVersion: integer('sheet_version').notNull().default(1),
  playerNotes: text('player_notes'),
  dmNotes: text('dm_notes'),
  imageAssetId: text('image_asset_id'),
  portrait: text('portrait'),
  hpCurrent: integer('hp_current'),
  hpMax: integer('hp_max'),
  hpTemp: integer('hp_temp'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('actors_campaign_idx').on(table.campaignId, table.createdAt, table.id),
  index('actors_kind_idx').on(table.kind, table.createdAt, table.id),
]);

export const assets = sqliteTable('assets', {
  id: text('id').primaryKey(),
  hash: text('hash').notNull(),
  mime: text('mime').notNull(),
  bytes: integer('bytes').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  originalPath: text('original_path').notNull(),
  webpPath: text('webp_path').notNull(),
  thumbPath: text('thumb_path').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('assets_hash_unique').on(table.hash),
]);

export const actionLog = sqliteTable('action_log', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id')
    .notNull()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  sceneId: text('scene_id').references(() => scenes.id, { onDelete: 'set null' }),
  actorId: text('actor_id').references(() => actors.id, { onDelete: 'set null' }),
  clientId: text('client_id').notNull(),
  origin: text('origin', { enum: ['dm', 'player'] }).notNull(),
  type: text('type').notNull(),
  label: text('label').notNull(),
  payload: text('payload').notNull(),
  inverse: text('inverse').notNull(),
  status: text('status', { enum: ['applied', 'undone'] }).notNull().default('applied'),
  stateVersion: integer('state_version').notNull(),
  createdAt: text('created_at').notNull(),
  undoneAt: text('undone_at'),
}, (table) => [
  index('action_log_campaign_idx').on(table.campaignId, table.createdAt, table.id),
]);

export const diceRolls = sqliteTable('dice_rolls', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id')
    .notNull()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  sceneId: text('scene_id').references(() => scenes.id, { onDelete: 'set null' }),
  actorId: text('actor_id').references(() => actors.id, { onDelete: 'set null' }),
  tokenId: text('token_id'),
  origin: text('origin', { enum: ['dm', 'player'] }).notNull(),
  formula: text('formula').notNull(),
  mode: text('mode', { enum: ['normal', 'advantage', 'disadvantage'] }).notNull(),
  dice: text('dice').notNull(),
  modifier: integer('modifier').notNull(),
  total: integer('total').notNull(),
  visibility: text('visibility', { enum: ['public', 'dm'] }).notNull(),
  label: text('label'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('dice_rolls_campaign_idx').on(table.campaignId, table.createdAt, table.id),
]);

export const programs = sqliteTable('programs', {
  campaignId: text('campaign_id')
    .primaryKey()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  state: text('state').notNull(),
  programVersion: integer('program_version').notNull().default(1),
  updatedAt: text('updated_at').notNull(),
});

export const displays = sqliteTable('displays', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id')
    .notNull()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  label: text('label').notNull(),
  composition: text('composition'),
  compositionVersion: integer('composition_version').notNull().default(1),
  viewportWidth: integer('viewport_width'),
  viewportHeight: integer('viewport_height'),
  createdAt: text('created_at').notNull(),
  lastSeenAt: text('last_seen_at'),
  revokedAt: text('revoked_at'),
}, (table) => [
  uniqueIndex('displays_code_unique').on(table.code),
  index('displays_campaign_idx').on(table.campaignId, table.createdAt),
]);

export const playerLinks = sqliteTable('player_links', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id')
    .notNull()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  actorId: text('actor_id')
    .notNull()
    .references(() => actors.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  editable: text('editable').notNull(),
  editingEnabled: integer('editing_enabled', { mode: 'boolean' }).notNull().default(true),
  label: text('label'),
  createdAt: text('created_at').notNull(),
  lastSeenAt: text('last_seen_at'),
  revokedAt: text('revoked_at'),
}, (table) => [
  uniqueIndex('player_links_token_unique').on(table.tokenHash),
  index('player_links_actor_idx').on(table.actorId, table.createdAt),
]);

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id')
    .notNull()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  number: integer('number').notNull(),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at'),
  durationSeconds: integer('duration_seconds'),
  notes: text('notes'),
}, (table) => [
  index('sessions_campaign_idx').on(table.campaignId, table.startedAt),
]);

export const schema = {
  campaigns,
  scenes,
  actors,
  assets,
  actionLog,
  diceRolls,
  programs,
  displays,
  playerLinks,
  sessions,
};
