import { z } from 'zod';
import {
  abilitySchema,
  armorCategorySchema,
  sizeSchema,
  skillSchema,
  weaponCategorySchema,
} from './common.js';
import {
  featureBlockSchema,
  itemDataSchema,
  sensesSchema,
  speedSchema,
} from './sheet.js';

const nonNegative = z.number().int().min(0);
const levelSchema = z.number().int().min(1).max(20);

export const srdMetaSchema = z.strictObject({
  version: z.string().min(1),
  name: z.string().min(1),
  license: z.strictObject({
    key: z.literal('CC-BY-4.0'),
    name: z.string().min(1),
    url: z.string().url(),
  }),
  source: z.strictObject({
    name: z.string().min(1),
    url: z.string().url(),
    importedFrom: z.string().min(1),
    importedAt: z.string().datetime(),
  }),
  counts: z.record(z.string(), nonNegative),
});
export type SrdMeta = z.infer<typeof srdMetaSchema>;

export const srdFeatureSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  level: levelSchema,
  description: z.string(),
  recharge: z.enum(['short', 'long', 'none']),
});
export type SrdFeature = z.infer<typeof srdFeatureSchema>;

export const srdSubclassSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  classId: z.string().min(1),
  features: z.array(srdFeatureSchema),
});
export type SrdSubclass = z.infer<typeof srdSubclassSchema>;

export const srdSpellcastingSchema = z.strictObject({
  ability: abilitySchema,
  progression: z.enum(['full', 'half', 'pact']),
  cantripsKnown: z.array(nonNegative).length(20),
  preparedSpells: z.array(nonNegative).length(20),
  slots: z.array(z.array(nonNegative).length(9)).length(20),
  pactSlots: z
    .array(z.strictObject({ level: nonNegative, count: nonNegative }))
    .length(20)
    .optional(),
});
export type SrdSpellcasting = z.infer<typeof srdSpellcastingSchema>;

export const srdStartingEquipmentSchema = z.strictObject({
  option: z.string().min(1),
  description: z.string(),
  gold: nonNegative,
});
export type SrdStartingEquipment = z.infer<typeof srdStartingEquipmentSchema>;

export const srdClassSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  hitDie: z.union([z.literal(6), z.literal(8), z.literal(10), z.literal(12)]),
  primaryAbilities: z.array(abilitySchema).min(1),
  savingThrows: z.array(abilitySchema).length(2),
  skillChoices: z.strictObject({
    count: z.number().int().min(0).max(6),
    from: z.array(skillSchema),
  }),
  toolProficiencies: z.array(z.string()),
  toolChoices: z
    .strictObject({ count: z.number().int().min(0), kind: z.string().min(1) })
    .optional(),
  armorTraining: z.array(armorCategorySchema),
  weaponProficiencies: z.array(weaponCategorySchema),
  weaponMasteryCount: z.array(nonNegative).length(20),
  startingGold: nonNegative,
  startingEquipment: z.array(srdStartingEquipmentSchema),
  subclassLevel: z.number().int().min(1).max(20),
  asiLevels: z.array(levelSchema),
  features: z.array(srdFeatureSchema),
  subclasses: z.array(srdSubclassSchema),
  spellcasting: srdSpellcastingSchema.optional(),
});
export type SrdClass = z.infer<typeof srdClassSchema>;

export const srdSpeciesSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  size: sizeSchema,
  sizes: z.array(sizeSchema).min(1),
  speed: z.number().int().min(0),
  darkvision: nonNegative.optional(),
  hpPerLevelBonus: nonNegative.optional(),
  powerfulBuild: z.boolean().optional(),
  languages: z.array(z.string()),
  languageChoices: nonNegative,
  skillProficiencies: z.array(skillSchema),
  skillChoices: z
    .strictObject({ count: z.number().int().min(0), from: z.array(skillSchema) })
    .optional(),
  traits: z.array(featureBlockSchema),
});
export type SrdSpecies = z.infer<typeof srdSpeciesSchema>;

export const srdBackgroundSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  abilityScoreOptions: z.array(abilitySchema).min(2),
  abilityScorePatterns: z.array(z.enum(['2-1', '1-1-1'])).min(1),
  featId: z.string().min(1),
  skillProficiencies: z.array(skillSchema),
  toolProficiency: z.string().optional(),
  startingGold: nonNegative,
  startingEquipment: z.array(srdStartingEquipmentSchema),
});
export type SrdBackground = z.infer<typeof srdBackgroundSchema>;

export const srdFeatSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(['origin', 'general', 'fightingStyle', 'epicBoon']),
  prerequisite: z.string().optional(),
  minLevel: z.number().int().min(1).max(20).optional(),
  repeatable: z.boolean(),
  abilityIncrease: z
    .strictObject({ amount: z.number().int().min(1).max(4), max: z.number().int().min(1).max(30) })
    .optional(),
  description: z.string(),
});
export type SrdFeat = z.infer<typeof srdFeatSchema>;

export const srdSpellSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  level: z.number().int().min(0).max(9),
  school: z.string().min(1),
  classes: z.array(z.string()),
  castingTime: z.string().min(1),
  range: z.string().min(1),
  components: z.strictObject({
    verbal: z.boolean(),
    somatic: z.boolean(),
    material: z.boolean(),
    materialText: z.string().optional(),
  }),
  duration: z.string().min(1),
  concentration: z.boolean(),
  ritual: z.boolean(),
  description: z.string(),
  higherLevel: z.string().optional(),
});
export type SrdSpell = z.infer<typeof srdSpellSchema>;

export const srdItemSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  category: z.enum([
    'weapon',
    'armor',
    'tool',
    'pack',
    'gear',
    'ammunition',
    'mount',
    'vehicle',
    'focus',
    'other',
  ]),
  valueGp: z.number().min(0),
  weightLb: z.number().min(0),
  description: z.string(),
  data: itemDataSchema,
});
export type SrdItem = z.infer<typeof srdItemSchema>;

export const srdMonsterSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  creatureType: z.string().min(1),
  size: sizeSchema,
  cr: z.string().min(1),
  ac: z.number().int().min(0),
  hp: z.strictObject({ max: z.number().int().min(1), formula: z.string() }),
  speed: speedSchema,
  senses: sensesSchema,
  languages: z.array(z.string()),
  abilities: z.strictObject({
    str: z.number().int().min(1).max(30),
    dex: z.number().int().min(1).max(30),
    con: z.number().int().min(1).max(30),
    int: z.number().int().min(1).max(30),
    wis: z.number().int().min(1).max(30),
    cha: z.number().int().min(1).max(30),
  }),
  savingThrows: z
    .strictObject({
      str: z.number().int().optional(),
      dex: z.number().int().optional(),
      con: z.number().int().optional(),
      int: z.number().int().optional(),
      wis: z.number().int().optional(),
      cha: z.number().int().optional(),
    })
    .optional(),
  skills: z
    .strictObject({
      acrobatics: z.number().int().optional(),
      animalHandling: z.number().int().optional(),
      arcana: z.number().int().optional(),
      athletics: z.number().int().optional(),
      deception: z.number().int().optional(),
      history: z.number().int().optional(),
      insight: z.number().int().optional(),
      intimidation: z.number().int().optional(),
      investigation: z.number().int().optional(),
      medicine: z.number().int().optional(),
      nature: z.number().int().optional(),
      perception: z.number().int().optional(),
      performance: z.number().int().optional(),
      persuasion: z.number().int().optional(),
      religion: z.number().int().optional(),
      sleightOfHand: z.number().int().optional(),
      stealth: z.number().int().optional(),
      survival: z.number().int().optional(),
    })
    .optional(),
  damageResistances: z.array(z.string()),
  damageImmunities: z.array(z.string()),
  damageVulnerabilities: z.array(z.string()),
  conditionImmunities: z.array(z.string()),
  traits: z.array(featureBlockSchema),
  actions: z.array(featureBlockSchema),
  reactions: z.array(featureBlockSchema),
  legendary: z
    .strictObject({ max: z.number().int().min(0), actions: z.array(featureBlockSchema) })
    .optional(),
});
export type SrdMonster = z.infer<typeof srdMonsterSchema>;

export const srdCatalogSchema = z.strictObject({
  meta: srdMetaSchema,
  classes: z.array(srdClassSchema),
  species: z.array(srdSpeciesSchema),
  backgrounds: z.array(srdBackgroundSchema),
  feats: z.array(srdFeatSchema),
  spells: z.array(srdSpellSchema),
  items: z.array(srdItemSchema),
  monsters: z.array(srdMonsterSchema),
});
export type SrdCatalog = z.infer<typeof srdCatalogSchema>;

export const srdCollections = [
  'classes',
  'species',
  'backgrounds',
  'feats',
  'spells',
  'items',
  'monsters',
] as const;
export type SrdCollection = (typeof srdCollections)[number];
