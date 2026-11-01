import type { Ability, Size, Skill } from '@dnd-vtt/shared';

export interface SensesLike {
  darkvision?: number | undefined;
  blindsight?: number | undefined;
  tremorsense?: number | undefined;
  truesight?: number | undefined;
}

export interface SpeedLike {
  walk: number;
  fly?: number | undefined;
  swim?: number | undefined;
  climb?: number | undefined;
  burrow?: number | undefined;
}

export const ABILITY_LABELS: Record<Ability, string> = {
  str: 'Forza',
  dex: 'Destrezza',
  con: 'Costituzione',
  int: 'Intelligenza',
  wis: 'Saggezza',
  cha: 'Carisma',
};

export const SKILL_LABELS: Record<Skill, string> = {
  acrobatics: 'Acrobazia',
  animalHandling: 'Addestrare animali',
  arcana: 'Arcano',
  athletics: 'Atletica',
  deception: 'Inganno',
  history: 'Storia',
  insight: 'Intuizione',
  intimidation: 'Intimidazione',
  investigation: 'Indagare',
  medicine: 'Medicina',
  nature: 'Natura',
  perception: 'Percezione',
  performance: 'Intrattenere',
  persuasion: 'Persuasione',
  religion: 'Religione',
  sleightOfHand: 'Mano di prestigio',
  stealth: 'Furtività',
  survival: 'Sopravvivenza',
};

export const SIZE_LABELS: Record<Size, string> = {
  tiny: 'Minuscola',
  small: 'Piccola',
  medium: 'Media',
  large: 'Grande',
  huge: 'Enorme',
  gargantuan: 'Mastodontica',
};

const SENSE_LABELS = {
  darkvision: 'Scurovisione',
  blindsight: 'Vista cieca',
  tremorsense: 'Percezione tellurica',
  truesight: 'Vista vera',
} as const;

const SPEED_LABELS = {
  walk: 'camminata',
  fly: 'volo',
  swim: 'nuoto',
  climb: 'scalata',
  burrow: 'scavo',
} as const;

export const formatSenses = (
  senses: SensesLike,
  formatDistance: (feet: number) => string,
): string => (Object.keys(SENSE_LABELS) as (keyof typeof SENSE_LABELS)[])
  .flatMap((sense) => {
    const value = senses[sense];
    return value === undefined ? [] : [`${SENSE_LABELS[sense]} ${formatDistance(value)}`];
  })
  .join(' · ');

export const formatSpeeds = (
  speed: SpeedLike,
  formatDistance: (feet: number) => string,
): string => (Object.keys(SPEED_LABELS) as (keyof typeof SPEED_LABELS)[])
  .flatMap((mode) => {
    const value = speed[mode];
    return value === undefined ? [] : [`${SPEED_LABELS[mode]} ${formatDistance(value)}`];
  })
  .join(' · ');
