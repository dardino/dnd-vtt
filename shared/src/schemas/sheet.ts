import { z } from 'zod';
import {
  abilitySchema,
  armorCategorySchema,
  conditionSchema,
  currencySchema,
  sizeSchema,
  skillSchema,
  weaponCategorySchema,
} from './common.js';

const positiveInt = z.number().int().min(0);
const levelSchema = z.number().int().min(1).max(20);

export const speedSchema = z.strictObject({
  walk: positiveInt,
  fly: positiveInt.optional(),
  swim: positiveInt.optional(),
  climb: positiveInt.optional(),
  burrow: positiveInt.optional(),
  hover: z.boolean().optional(),
});
export type Speed = z.infer<typeof speedSchema>;

export const sensesSchema = z.strictObject({
  darkvision: positiveInt.optional(),
  blindsight: positiveInt.optional(),
  tremorsense: positiveInt.optional(),
  truesight: positiveInt.optional(),
});
export type Senses = z.infer<typeof sensesSchema>;

export const hpSchema = z.strictObject({
  current: z.number().int(),
  max: z.number().int(),
  temp: positiveInt,
});
export type HitPoints = z.infer<typeof hpSchema>;

export const weaponDataSchema = z.strictObject({
  category: z.literal('weapon'),
  damage: z.strictObject({ dice: z.string().min(1), type: z.string().min(1) }),
  properties: z.array(z.string()),
  mastery: z.string().optional(),
  range: z.strictObject({ normal: positiveInt, long: positiveInt.optional() }).optional(),
  versatile: z.string().optional(),
  simple: z.boolean(),
  martial: z.boolean(),
});
export type WeaponData = z.infer<typeof weaponDataSchema>;

export const armorDataSchema = z.strictObject({
  category: z.literal('armor'),
  armorCategory: z.enum(['light', 'medium', 'heavy', 'shield']),
  baseAc: positiveInt,
  dexCap: positiveInt.optional(),
  strength: positiveInt.optional(),
  stealthDisadvantage: z.boolean().optional(),
  shield: z.boolean(),
});
export type ArmorData = z.infer<typeof armorDataSchema>;

export const gearCategorySchema = z.enum([
  'tool',
  'pack',
  'gear',
  'ammunition',
  'mount',
  'vehicle',
  'focus',
  'other',
]);
export type GearCategory = z.infer<typeof gearCategorySchema>;

export type GearData = { category: GearCategory };

const gearVariants = gearCategorySchema.options.map((category) =>
  z.strictObject({ category: z.literal(category) }));

export const itemDataSchema = z.union([
  weaponDataSchema,
  armorDataSchema,
  ...gearVariants,
]);
export type ItemData = z.infer<typeof itemDataSchema>;

export const resolvedItemSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  data: itemDataSchema,
  valueGp: z.number().min(0).optional(),
  weightLb: z.number().min(0).optional(),
});
export type ResolvedItem = z.infer<typeof resolvedItemSchema>;

export const resolvedFeatureSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  level: levelSchema,
  source: z.enum(['class', 'subclass', 'species', 'background', 'feat', 'item']),
  description: z.string(),
  recharge: z.enum(['short', 'long', 'none']),
});
export type ResolvedFeature = z.infer<typeof resolvedFeatureSchema>;

export const resolvedSpellSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  level: z.number().int().min(0).max(9),
  school: z.string().min(1),
  castingTime: z.string().min(1),
  range: z.string().min(1),
  components: z.string().min(1),
  duration: z.string().min(1),
  concentration: z.boolean(),
  ritual: z.boolean(),
  description: z.string(),
});
export type ResolvedSpell = z.infer<typeof resolvedSpellSchema>;

export const sheetSnapshotSchema = z.strictObject({
  features: z.array(resolvedFeatureSchema),
  spells: z.array(resolvedSpellSchema),
  items: z.array(resolvedItemSchema),
});
export type SheetSnapshot = z.infer<typeof sheetSnapshotSchema>;

export const resourcePoolSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  max: positiveInt,
  used: positiveInt,
  recharge: z.enum(['short', 'long', 'none']),
});
export type ResourcePool = z.infer<typeof resourcePoolSchema>;

export const spellChoiceSchema = z.strictObject({
  id: z.string().min(1),
  source: z.enum(['class', 'subclass', 'species', 'feat', 'item']),
  prepared: z.boolean().optional(),
  alwaysPrepared: z.boolean().optional(),
});
export type SpellChoice = z.infer<typeof spellChoiceSchema>;

export const spellSlotPoolSchema = z.strictObject({
  level: z.number().int().min(1).max(9),
  max: positiveInt,
  used: positiveInt,
});
export type SpellSlotPool = z.infer<typeof spellSlotPoolSchema>;

export const spellSelectionSchema = z.strictObject({
  ability: abilitySchema.optional(),
  cantrips: z.array(spellChoiceSchema),
  known: z.array(spellChoiceSchema),
  prepared: z.array(spellChoiceSchema),
  alwaysPrepared: z.array(spellChoiceSchema),
  spellbook: z.array(spellChoiceSchema),
  slots: z.array(spellSlotPoolSchema),
  pactSlots: z
    .strictObject({
      level: z.number().int().min(1).max(9),
      max: positiveInt,
      used: positiveInt,
    })
    .optional(),
});
export type SpellSelection = z.infer<typeof spellSelectionSchema>;

export const overridesSchema = z
  .strictObject({
    ac: z.number().int().optional(),
    initiative: z.number().int().optional(),
    passivePerception: z.number().int().optional(),
    spellSaveDC: z.number().int().optional(),
    spellAttackBonus: z.number().int().optional(),
    saves: z
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
    speed: speedSchema.partial().optional(),
  });
export type SheetOverrides = z.infer<typeof overridesSchema>;

export const statblockCoreShape = {
  size: sizeSchema,
  abilities: z.strictObject({
    str: z.number().int().min(1).max(30),
    dex: z.number().int().min(1).max(30),
    con: z.number().int().min(1).max(30),
    int: z.number().int().min(1).max(30),
    wis: z.number().int().min(1).max(30),
    cha: z.number().int().min(1).max(30),
  }),
  hp: hpSchema,
  speed: speedSchema,
  senses: sensesSchema,
  languages: z.array(z.string()),
  conditions: z.array(conditionSchema),
} as const;

export const abilityGenerationSchema = z.strictObject({
  method: z.enum(['pointBuy', 'standardArray', 'rolled', 'manual']),
  base: z.strictObject({
    str: z.number().int().min(3).max(20),
    dex: z.number().int().min(3).max(20),
    con: z.number().int().min(3).max(20),
    int: z.number().int().min(3).max(20),
    wis: z.number().int().min(3).max(20),
    cha: z.number().int().min(3).max(20),
  }),
  rolls: z.array(z.number().int().min(3).max(18)).length(6).optional(),
  rollId: z.string().min(1).optional(),
});
export type AbilityGeneration = z.infer<typeof abilityGenerationSchema>;

export const abilityIncreaseSchema = z.strictObject({
  source: z.enum(['background', 'asi', 'feat', 'species']),
  ability: abilitySchema,
  amount: z.number().int().min(1).max(4),
});
export type AbilityIncrease = z.infer<typeof abilityIncreaseSchema>;

export const proficienciesSchema = z.strictObject({
  saves: z.array(abilitySchema),
  skills: z.array(skillSchema),
  expertise: z.array(skillSchema),
  tools: z.array(z.string()),
  armor: z.array(armorCategorySchema),
  weapons: z.array(weaponCategorySchema),
});
export type Proficiencies = z.infer<typeof proficienciesSchema>;

export const featChoiceSchema = z.strictObject({
  id: z.string().min(1),
  choices: z.record(z.string(), z.string()).optional(),
});
export type FeatChoice = z.infer<typeof featChoiceSchema>;

export const deathSavesSchema = z.strictObject({
  successes: z.number().int().min(0).max(3),
  failures: z.number().int().min(0).max(3),
});
export type DeathSaves = z.infer<typeof deathSavesSchema>;

export const hitDiceSchema = z.strictObject({
  die: z.number().int().min(4).max(12),
  total: positiveInt,
  used: positiveInt,
});
export type HitDice = z.infer<typeof hitDiceSchema>;

export const characterClassSchema = z.strictObject({
  id: z.string().min(1),
  subclassId: z.string().min(1).optional(),
  level: levelSchema,
});
export type CharacterClass = z.infer<typeof characterClassSchema>;

export const pcStatblockSchema = z.strictObject({
  kind: z.literal('pc'),
  ...statblockCoreShape,
  rulesVersion: z.string().min(1),
  class: characterClassSchema,
  species: z.strictObject({
    id: z.string().min(1),
    choices: z.record(z.string(), z.string()).optional(),
  }),
  background: z.strictObject({ id: z.string().min(1) }),
  alignment: z.string().optional(),
  abilityGeneration: abilityGenerationSchema,
  abilityIncreases: z.array(abilityIncreaseSchema),
  proficiencies: proficienciesSchema,
  feats: z.array(featChoiceSchema),
  weaponMasteries: z.array(z.string()),
  resources: z.array(resourcePoolSchema),
  spells: spellSelectionSchema,
  hitDice: hitDiceSchema,
  hpRolls: z.array(z.number().int().min(1).max(12)),
  deathSaves: deathSavesSchema,
  currency: currencySchema,
  overrides: overridesSchema,
  snapshot: sheetSnapshotSchema,
});
export type PcStatblock = z.infer<typeof pcStatblockSchema>;

export const featureBlockSchema = z.strictObject({
  name: z.string().min(1),
  description: z.string(),
  attack: z
    .strictObject({
      toHit: z.number().int(),
      reach: positiveInt.optional(),
      range: z.string().optional(),
      damage: z.string().min(1),
    })
    .optional(),
  recharge: z.enum(['short', 'long', 'none']),
});
export type FeatureBlock = z.infer<typeof featureBlockSchema>;

export const monsterStatblockSchema = z.strictObject({
  kind: z.literal('monster'),
  ...statblockCoreShape,
  rulesVersion: z.string().min(1).optional(),
  creatureType: z.string().min(1),
  cr: z.string().min(1),
  tags: z.array(z.string()),
  ac: z.number().int().min(0),
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
    .strictObject({
      max: positiveInt,
      actions: z.array(featureBlockSchema),
    })
    .optional(),
  spellcasting: z
    .strictObject({
      ability: abilitySchema,
      dc: z.number().int(),
      attackBonus: z.number().int(),
      spells: z.array(spellChoiceSchema),
    })
    .optional(),
  snapshot: sheetSnapshotSchema.optional(),
});
export type MonsterStatblock = z.infer<typeof monsterStatblockSchema>;

export const npcStatblockSchema = z.strictObject({
  kind: z.literal('npc'),
  ...statblockCoreShape,
  rulesVersion: z.string().min(1).optional(),
  creatureType: z.string().min(1),
  role: z.string().optional(),
  tags: z.array(z.string()),
  ac: z.number().int().min(0),
  savingThrows: monsterStatblockSchema.shape.savingThrows,
  skills: monsterStatblockSchema.shape.skills,
  damageResistances: z.array(z.string()),
  damageImmunities: z.array(z.string()),
  damageVulnerabilities: z.array(z.string()),
  conditionImmunities: z.array(z.string()),
  traits: z.array(featureBlockSchema),
  actions: z.array(featureBlockSchema),
  reactions: z.array(featureBlockSchema),
  legendary: z
    .strictObject({
      max: positiveInt,
      actions: z.array(featureBlockSchema),
    })
    .optional(),
  spellcasting: monsterStatblockSchema.shape.spellcasting,
  snapshot: sheetSnapshotSchema.optional(),
});
export type NpcStatblock = z.infer<typeof npcStatblockSchema>;

export const actorStatblockSchema = z.discriminatedUnion('kind', [
  pcStatblockSchema,
  monsterStatblockSchema,
  npcStatblockSchema,
]);
export type ActorStatblock = z.infer<typeof actorStatblockSchema>;

export const attackProfileSchema = z.strictObject({
  itemId: z.string().min(1),
  name: z.string().min(1),
  ability: abilitySchema,
  toHit: z.number().int(),
  damage: z.string().min(1),
  properties: z.array(z.string()),
});
export type AttackProfile = z.infer<typeof attackProfileSchema>;

export const derivedSheetSchema = z.strictObject({
  proficiencyBonus: z.number().int().min(2).max(6),
  initiative: z.number().int(),
  saves: z.strictObject({
    str: z.number().int(),
    dex: z.number().int(),
    con: z.number().int(),
    int: z.number().int(),
    wis: z.number().int(),
    cha: z.number().int(),
  }),
  skills: z.strictObject({
    acrobatics: z.number().int(),
    animalHandling: z.number().int(),
    arcana: z.number().int(),
    athletics: z.number().int(),
    deception: z.number().int(),
    history: z.number().int(),
    insight: z.number().int(),
    intimidation: z.number().int(),
    investigation: z.number().int(),
    medicine: z.number().int(),
    nature: z.number().int(),
    perception: z.number().int(),
    performance: z.number().int(),
    persuasion: z.number().int(),
    religion: z.number().int(),
    sleightOfHand: z.number().int(),
    stealth: z.number().int(),
    survival: z.number().int(),
  }),
  passivePerception: z.number().int(),
  spellSaveDC: z.number().int().optional(),
  spellAttackBonus: z.number().int().optional(),
  ac: z.number().int(),
  attacks: z.array(attackProfileSchema),
  carryCapacity: z.number().min(0),
  speed: speedSchema,
});
export type DerivedSheet = z.infer<typeof derivedSheetSchema>;
