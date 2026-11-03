import { describe, expect, it } from 'vitest';
import { classFeaturesFor } from './class-features.js';
import { testCatalog } from './__fixtures__/catalog.js';

const fighter = testCatalog.classes.find((entry) => entry.id === 'fighter');
if (fighter === undefined) {
  throw new Error('fixture fighter mancante');
}

describe('classFeaturesFor', () => {
  it('include solo le feature di classe fino al livello richiesto', () => {
    const features = classFeaturesFor(fighter, undefined, 2);

    expect(features.map((entry) => entry.id)).toEqual(['fighter-second-wind']);
    expect(features[0]).toMatchObject({
      level: 1,
      source: 'class',
      recharge: 'short',
    });
  });

  it('aggiunge le feature di sottoclasse dal loro livello, dopo quelle di classe', () => {
    expect(classFeaturesFor(fighter, 'champion', 2).map((entry) => entry.id))
      .toEqual(['fighter-second-wind']);
    const features = classFeaturesFor(fighter, 'champion', 3);
    expect(features.map((entry) => entry.id))
      .toEqual(['fighter-second-wind', 'champion-improved-critical']);
    expect(features[1]?.source).toBe('subclass');
  });

  it('ignora una sottoclasse sconosciuta', () => {
    const features = classFeaturesFor(fighter, 'inesistente', 20);
    expect(features.map((entry) => entry.id)).toEqual(['fighter-second-wind']);
  });
});
