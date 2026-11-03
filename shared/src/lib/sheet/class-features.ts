import type { ResolvedFeature } from '../../schemas/sheet.js';
import type { SrdClass, SrdFeature } from '../../schemas/srd.js';

const resolvedFeature = (
  entry: SrdFeature,
  source: Extract<ResolvedFeature['source'], 'class' | 'subclass'>,
): ResolvedFeature => ({
  id: entry.id,
  name: entry.name,
  level: entry.level,
  description: entry.description,
  recharge: entry.recharge,
  source,
});

/**
 * Privilegi di classe e sottoclasse disponibili a un dato livello.
 * Le feature di classe vengono prima di quelle della sottoclasse (D56).
 */
export const classFeaturesFor = (
  characterClass: SrdClass,
  subclassId: string | undefined,
  level: number,
): ResolvedFeature[] => {
  const classFeatures = characterClass.features
    .filter((entry) => entry.level <= level)
    .map((entry) => resolvedFeature(entry, 'class'));
  const subclass = characterClass.subclasses.find((entry) => entry.id === subclassId);
  const subclassFeatures = (subclass?.features ?? [])
    .filter((entry) => entry.level <= level)
    .map((entry) => resolvedFeature(entry, 'subclass'));
  return [...classFeatures, ...subclassFeatures];
};
