import { z } from 'zod';

export const abilitySchema = z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']);
export type Ability = z.infer<typeof abilitySchema>;
export const abilities: readonly Ability[] = abilitySchema.options;

export const skillSchema = z.enum([
  'acrobatics',
  'animalHandling',
  'arcana',
  'athletics',
  'deception',
  'history',
  'insight',
  'intimidation',
  'investigation',
  'medicine',
  'nature',
  'perception',
  'performance',
  'persuasion',
  'religion',
  'sleightOfHand',
  'stealth',
  'survival',
]);
export type Skill = z.infer<typeof skillSchema>;
export const skills: readonly Skill[] = skillSchema.options;

export const sizeSchema = z.enum(['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']);
export type Size = z.infer<typeof sizeSchema>;

export const armorCategorySchema = z.enum(['light', 'medium', 'heavy', 'shield']);
export type ArmorCategory = z.infer<typeof armorCategorySchema>;

export const weaponCategorySchema = z.enum(['simple', 'martial']);
export type WeaponCategory = z.infer<typeof weaponCategorySchema>;

export const conditionNameSchema = z.enum([
  'blinded',
  'charmed',
  'deafened',
  'exhaustion',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
]);
export type ConditionName = z.infer<typeof conditionNameSchema>;

export const conditionSchema = z
  .strictObject({
    name: conditionNameSchema,
    level: z.number().int().min(1).max(6).optional(),
    rounds: z.number().int().min(0).nullable().optional(),
    concentration: z.boolean().optional(),
  })
  .refine((value) => value.name === 'exhaustion' || value.level === undefined, {
    message: 'solo lo sfinimento ha un livello',
    path: ['level'],
  });
export type Condition = z.infer<typeof conditionSchema>;

export const currencySchema = z.strictObject({
  cp: z.number().int().min(0),
  sp: z.number().int().min(0),
  ep: z.number().int().min(0),
  gp: z.number().int().min(0),
  pp: z.number().int().min(0),
});
export type Currency = z.infer<typeof currencySchema>;

export const emptyCurrency = (): Currency => ({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 });

const ELECTRUM_TO_GP = 0.5;
const SILVER_TO_GP = 0.1;
const COPPER_TO_GP = 0.01;
const PLATINUM_TO_GP = 10;

export const currencyToGp = (currency: Currency): number =>
  currency.gp
  + currency.pp * PLATINUM_TO_GP
  + currency.ep * ELECTRUM_TO_GP
  + currency.sp * SILVER_TO_GP
  + currency.cp * COPPER_TO_GP;
