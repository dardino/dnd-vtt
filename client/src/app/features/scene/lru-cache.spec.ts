import { describe, expect, it } from 'vitest';
import { LruCache } from './lru-cache';

describe('LruCache', () => {
  it('espelle le entry più vecchie oltre il limite', () => {
    const cache = new LruCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    expect([...cache.keys()]).toEqual(['b', 'c']);
    expect(cache.has('a')).toBe(false);
  });

  it('riporta in fondo la entry letta con get', () => {
    const cache = new LruCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1);

    cache.set('c', 3);

    expect([...cache.keys()]).toEqual(['a', 'c']);
    expect(cache.get('b')).toBeUndefined();
  });

  it('non duplica una entry aggiornata e ne aggiorna la posizione', () => {
    const cache = new LruCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 10);

    expect(cache.size).toBe(2);
    expect(cache.get('a')).toBe(10);
    expect([...cache.keys()]).toEqual(['b', 'a']);
  });

  it('rimuove la entry su delete e la reinserisce in fondo', () => {
    const cache = new LruCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.delete('a');
    cache.set('a', 3);

    expect([...cache.keys()]).toEqual(['b', 'a']);
    expect(cache.size).toBe(2);
  });

  it('rifiuta un limite non positivo', () => {
    expect(() => new LruCache<string, number>(0)).toThrow(RangeError);
    expect(() => new LruCache<string, number>(1.5)).toThrow(RangeError);
  });
});
