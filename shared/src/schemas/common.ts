import { z } from 'zod';

export const abilitySchema = z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']);
export type Ability = z.infer<typeof abilitySchema>;
export const abilities: readonly Ability[] = abilitySchema.options;

/** Ordine canonico delle skill, condiviso da schemi, derivazioni e UI. */
export const skillsTuple = [
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
] as const;

export const skillSchema = z.enum(skillsTuple);
export type Skill = z.infer<typeof skillSchema>;
export const skills: readonly Skill[] = skillsTuple;

const skillBonus = z.number().int().optional();

/** Bonus per skill derivati dalla lista canonica, senza 18 campi ripetuti. */
export const skillBonusesSchema = z.strictObject(
  Object.fromEntries(skillsTuple.map((skill) => [skill, skillBonus])) as {
    [K in Skill]: typeof skillBonus;
  },
);
export type SkillBonuses = z.infer<typeof skillBonusesSchema>;

const skillValue = z.number().int();

/** Valori skill obbligatori (schede derivate) generati dalla stessa lista. */
export const skillValuesSchema = z.strictObject(
  Object.fromEntries(skillsTuple.map((skill) => [skill, skillValue])) as {
    [K in Skill]: typeof skillValue;
  },
);
export type SkillValues = z.infer<typeof skillValuesSchema>;

/** Vista condivisa da mappe, scene e display: centro e zoom. */
export const viewSchema = z.strictObject({
  x: z.number(),
  y: z.number(),
  zoom: z.number().positive(),
});
export type View = z.infer<typeof viewSchema>;

/** Envelope comune alle liste paginate a cursore. */
export const paginatedSchema = <T extends z.ZodType>(item: T) =>
  z.strictObject({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });

export const imageMimeSchema = z.enum(['image/png', 'image/jpeg', 'image/webp']);
export type ImageMime = z.infer<typeof imageMimeSchema>;

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

/**
 * La contabilità usa sempre il rame intero: sommare `valueGp` in floating
 * point produce artefatti come 4.980000000000004. `1 mo = 100 mr`.
 */
export const COPPER_PER_GP = 100;

export const gpToCopper = (gp: number): number => Math.round(gp * COPPER_PER_GP);

export const currencyToCopper = (currency: Currency): number =>
  currency.pp * 1000
  + currency.gp * 100
  + currency.ep * 50
  + currency.sp * 10
  + currency.cp;

/** Riporta un totale in rame alle monete canoniche (niente elettro). */
export const currencyFromCopper = (copper: number): Currency => {
  const total = Math.max(0, Math.round(copper));
  return {
    pp: Math.floor(total / 1000),
    gp: Math.floor((total % 1000) / 100),
    ep: 0,
    sp: Math.floor((total % 100) / 10),
    cp: total % 10,
  };
};

export const remainingCurrency = (budgetGp: number, spentCopper: number): Currency =>
  currencyFromCopper(gpToCopper(budgetGp) - spentCopper);

/** Formatta un totale in rame come mo con al massimo due decimali. */
export const formatGp = (copper: number): string => {
  const value = (Math.max(0, Math.round(copper)) / COPPER_PER_GP).toFixed(2);
  return value.endsWith('.00') ? value.slice(0, -3) : value;
};

export const currencyToGp = (currency: Currency): number =>
  currencyToCopper(currency) / COPPER_PER_GP;
