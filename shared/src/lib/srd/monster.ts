import type { MonsterStatblock } from '../../schemas/sheet.js';
import type { SrdMonster } from '../../schemas/srd.js';

/**
 * Copia un mostro del catalogo SRD in uno statblock indipendente: il tavolo
 * può modificarlo senza toccare i dati SRD, che restano immutabili.
 */
export const srdMonsterToStatblock = (monster: SrdMonster): MonsterStatblock => ({
  kind: 'monster',
  size: monster.size,
  abilities: monster.abilities,
  hp: { current: monster.hp.max, max: monster.hp.max, temp: 0 },
  speed: monster.speed,
  senses: monster.senses,
  languages: monster.languages,
  conditions: [],
  creatureType: monster.creatureType,
  cr: monster.cr,
  tags: [],
  ac: monster.ac,
  ...(monster.savingThrows === undefined ? {} : { savingThrows: monster.savingThrows }),
  ...(monster.skills === undefined ? {} : { skills: monster.skills }),
  damageResistances: monster.damageResistances,
  damageImmunities: monster.damageImmunities,
  damageVulnerabilities: monster.damageVulnerabilities,
  conditionImmunities: monster.conditionImmunities,
  traits: monster.traits,
  actions: monster.actions,
  reactions: monster.reactions,
  ...(monster.legendary === undefined ? {} : { legendary: monster.legendary }),
});
