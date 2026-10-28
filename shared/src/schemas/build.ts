import { z } from 'zod';
import { abilitySchema, currencySchema, skillSchema } from './common.js';
import { abilityIncreaseSchema, featChoiceSchema } from './sheet.js';

export const buildStepSchema = z.enum([
  'identity',
  'abilities',
  'proficiencies',
  'equipment',
  'spells',
  'details',
  'summary',
]);
export type BuildStep = z.infer<typeof buildStepSchema>;

export const asiChoiceSchema = z.strictObject({
  level: z.number().int().min(1).max(20),
  type: z.enum(['asi', 'feat']),
  increases: z.array(abilityIncreaseSchema).optional(),
  featId: z.string().min(1).optional(),
});
export type AsiChoice = z.infer<typeof asiChoiceSchema>;

export const equipmentChoiceSchema = z.strictObject({
  itemId: z.string().min(1),
  quantity: z.number().int().min(1),
});
export type EquipmentChoice = z.infer<typeof equipmentChoiceSchema>;

export const spellBuildSchema = z.strictObject({
  cantrips: z.array(z.string().min(1)),
  known: z.array(z.string().min(1)),
  prepared: z.array(z.string().min(1)),
  spellbook: z.array(z.string().min(1)),
});
export type SpellBuild = z.infer<typeof spellBuildSchema>;

export const pcBuildSchema = z.strictObject({
  rulesVersion: z.string().min(1),
  level: z.number().int().min(1).max(20),
  classId: z.string().min(1),
  subclassId: z.string().min(1).optional(),
  speciesId: z.string().min(1),
  backgroundId: z.string().min(1),
  abilityGeneration: z.strictObject({
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
  }),
  backgroundIncreases: z.array(abilityIncreaseSchema),
  feats: z.array(featChoiceSchema),
  proficiencies: z.strictObject({
    classSkills: z.array(skillSchema),
    speciesSkills: z.array(skillSchema),
    expertise: z.array(skillSchema),
    tools: z.array(z.string()),
    languages: z.array(z.string()),
  }),
  asiChoices: z.array(asiChoiceSchema),
  weaponMasteries: z.array(z.string()),
  equipment: z.array(equipmentChoiceSchema),
  currency: currencySchema,
  budgetGp: z.number().min(0),
  spells: spellBuildSchema,
  hpRolls: z.array(z.number().int().min(1).max(12)),
  originFeatId: z.string().min(1).optional(),
  overrides: z
    .strictObject({
      ac: z.number().int().optional(),
      initiative: z.number().int().optional(),
      passivePerception: z.number().int().optional(),
      spellSaveDC: z.number().int().optional(),
      spellAttackBonus: z.number().int().optional(),
    })
    .optional(),
});
export type PcBuild = z.infer<typeof pcBuildSchema>;

export interface BuildError {
  step: BuildStep;
  code: string;
  message: string;
  field?: string;
}

export interface BuildWarning {
  step: BuildStep;
  code: string;
  message: string;
}

export interface BuildValidation {
  ok: boolean;
  errors: BuildError[];
  warnings: BuildWarning[];
  expectedHpMax?: number;
  totalAbilityScores?: Record<string, number>;
}

export const abilityChoiceSchema = z.array(abilitySchema);
