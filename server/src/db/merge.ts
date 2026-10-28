/**
 * Le patch Zod contengono solo i campi presenti nel body, ma il tipo inferito
 * li espone come `| undefined`. Questo helper applica solo i valori definiti,
 * senza rischiare di azzerare una colonna con `undefined`.
 */
export const mergeDefined = <T extends object>(
  base: T,
  patch: { [K in keyof T]?: T[K] | undefined },
): T => {
  const merged = { ...base };
  for (const key of Object.keys(patch) as (keyof T)[]) {
    const value = patch[key];
    if (value !== undefined) {
      merged[key] = value;
    }
  }
  return merged;
};
