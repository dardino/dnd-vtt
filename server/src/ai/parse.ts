import type { MonsterStatblock } from '@dnd-vtt/shared';

const number = (pattern: RegExp, text: string, fallback: number): number => {
  const match = pattern.exec(text);
  return match === null ? fallback : Number(match[1]);
};

const abilityLine = (text: string): MonsterStatblock['abilities'] => {
  const match = /STR\s+(\d+).*?DEX\s+(\d+).*?CON\s+(\d+).*?INT\s+(\d+).*?WIS\s+(\d+).*?CHA\s+(\d+)/is
    .exec(text);
  return match === null
    ? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }
    : {
      str: Number(match[1]),
      dex: Number(match[2]),
      con: Number(match[3]),
      int: Number(match[4]),
      wis: Number(match[5]),
      cha: Number(match[6]),
    };
};

/**
 * Fallback regex per l'import di uno statblock testuale quando il provider AI
 * non è configurato: produce una bozza modificabile, non un risultato definitivo.
 */
export const parseMonsterText = (text: string): MonsterStatblock => {
  const typeMatch = /(?:Type|Tipo)\s*:?\s*([^\n]+)/i.exec(text);
  const crMatch = /(?:Challenge|CR|Grado di sfida)\s*:?\s*([0-9/]+)/i.exec(text);
  return {
    kind: 'monster',
    size: 'medium',
    abilities: abilityLine(text),
    hp: {
      current: number(/(?:Hit Points|Punti ferita|PF)\s*:?\s*(\d+)/i, text, 10),
      max: number(/(?:Hit Points|Punti ferita|PF)\s*:?\s*(\d+)/i, text, 10),
      temp: 0,
    },
    speed: { walk: number(/(?:Speed|Velocità)\s*:?\s*(\d+)/i, text, 30) },
    senses: {},
    languages: [],
    conditions: [],
    creatureType: (typeMatch?.[1] ?? 'Humanoid').trim(),
    cr: crMatch?.[1] ?? '0',
    tags: [],
    ac: number(/(?:Armor Class|Classe armatura|CA)\s*:?\s*(\d+)/i, text, 10),
    damageResistances: [],
    damageImmunities: [],
    damageVulnerabilities: [],
    conditionImmunities: [],
    traits: [],
    actions: [],
    reactions: [],
  };
};
