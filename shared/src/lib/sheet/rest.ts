import type { PcStatblock } from '../../schemas/sheet.js';

const resetResources = (
  statblock: PcStatblock,
  recharges: readonly ('short' | 'long')[],
): PcStatblock => ({
  ...statblock,
  resources: statblock.resources.map((resource) =>
    recharges.some((recharge) => recharge === resource.recharge)
      ? { ...resource, used: 0 }
      : resource),
});

const resetSpellSlots = (statblock: PcStatblock): PcStatblock => ({
  ...statblock,
  spells: {
    ...statblock.spells,
    slots: statblock.spells.slots.map((slot) => ({ ...slot, used: 0 })),
    ...(statblock.spells.pactSlots === undefined
      ? {}
      : { pactSlots: { ...statblock.spells.pactSlots, used: 0 } }),
  },
});

/**
 * Riposo breve SRD 5.2: ricarica solo risorse e slot pact, non cura e non
 * restituisce dadi vita (D60).
 */
export const applyShortRest = (statblock: PcStatblock): PcStatblock => {
  const withResources = resetResources(statblock, ['short']);
  return {
    ...withResources,
    spells: {
      ...withResources.spells,
      ...(withResources.spells.pactSlots === undefined
        ? {}
        : { pactSlots: { ...withResources.spells.pactSlots, used: 0 } }),
    },
  };
};

/**
 * Riposo lungo SRD 5.2: recupera tutti gli HP senza toccare i temporanei,
 * azzera i dadi vita spesi, riduce l'exhaustion di 1, azzera i death saves
 * e ricarica slot e risorse short/long (D60).
 */
export const applyLongRest = (statblock: PcStatblock): PcStatblock => {
  const withResources = resetResources(statblock, ['short', 'long']);
  const withSpells = resetSpellSlots(withResources);
  const exhaustion = withSpells.conditions.find((condition) => condition.name === 'exhaustion');
  const conditions = exhaustion === undefined
    ? withSpells.conditions
    : withSpells.conditions.flatMap((condition) => {
      if (condition.name !== 'exhaustion') {
        return [condition];
      }
      const level = (condition.level ?? 1) - 1;
      return level <= 0 ? [] : [{ ...condition, level }];
    });
  return {
    ...withSpells,
    hp: { current: withSpells.hp.max, max: withSpells.hp.max, temp: withSpells.hp.temp },
    hitDice: { ...withSpells.hitDice, used: 0 },
    deathSaves: { successes: 0, failures: 0 },
    conditions,
  };
};
