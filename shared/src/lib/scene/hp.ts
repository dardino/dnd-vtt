import type { HitPoints } from '../../schemas/sheet.js';

/**
 * Applica un delta ai punti ferita: i danni consumano prima i temporanei,
 * la cura non supera il massimo e i PF non scendono sotto zero (7.4).
 */
export const applyHpDelta = (hp: HitPoints, delta: number): HitPoints => {
  if (!Number.isInteger(delta)) {
    throw new Error('il delta dei punti ferita deve essere intero');
  }
  if (delta < 0) {
    const damage = -delta;
    const absorbed = Math.min(hp.temp, damage);
    return {
      current: Math.max(0, hp.current - (damage - absorbed)),
      max: hp.max,
      temp: hp.temp - absorbed,
    };
  }
  return {
    current: Math.min(hp.max, hp.current + delta),
    max: hp.max,
    temp: hp.temp,
  };
};
