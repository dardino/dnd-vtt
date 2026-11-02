/**
 * `Map` con limite LRU: l'ordine di inserimento della `Map` fa da coda,
 * ogni lettura riporta la entry in fondo e `set` espelle la più vecchia.
 */
export class LruCache<K, V> extends Map<K, V> {
  public constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError(`limite LRU non valido: ${String(limit)}`);
    }
    super();
  }

  public override get(key: K): V | undefined {
    if (!this.has(key)) {
      return undefined;
    }
    const value = super.get(key) as V;
    super.delete(key);
    super.set(key, value);
    return value;
  }

  public override set(key: K, value: V): this {
    if (this.has(key)) {
      super.delete(key);
    }
    super.set(key, value);
    while (this.size > this.limit) {
      const oldest = this.keys().next();
      if (oldest.done === true) {
        break;
      }
      super.delete(oldest.value);
    }
    return this;
  }
}
