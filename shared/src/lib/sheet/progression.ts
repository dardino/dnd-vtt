export const XP_THRESHOLDS: readonly number[] = [
  0,
  300,
  900,
  2700,
  6500,
  14000,
  23000,
  34000,
  48000,
  64000,
  85000,
  100000,
  120000,
  140000,
  165000,
  195000,
  225000,
  265000,
  305000,
  355000,
];

export const xpThresholdForLevel = (level: number): number => {
  if (level < 1 || level > 20) {
    throw new RangeError(`livello fuori intervallo: ${level}`);
  }
  const value = XP_THRESHOLDS[level - 1];
  if (value === undefined) {
    throw new RangeError(`soglia XP mancante per il livello ${level}`);
  }
  return value;
};

export const levelForXp = (xp: number): number => {
  let level = 1;
  for (let candidate = 1; candidate <= 20; candidate += 1) {
    const threshold = xpThresholdForLevel(candidate);
    if (xp >= threshold) {
      level = candidate;
    }
  }
  return level;
};

export const xpForNextLevel = (level: number, xp: number): number | undefined => {
  if (level >= 20) {
    return undefined;
  }
  return Math.max(0, xpThresholdForLevel(level + 1) - xp);
};

export const averageHpGain = (hitDie: number): number => Math.floor(hitDie / 2) + 1;

export const maxSpellLevel = (slots: readonly { level: number; max: number }[]): number =>
  slots.reduce((highest, slot) => (slot.max > 0 ? Math.max(highest, slot.level) : highest), 0);
