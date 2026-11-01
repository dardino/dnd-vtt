import { describe, expect, it } from 'vitest';
import { newId } from './id.js';

describe('newId', () => {
  it('genera UUID v7 con la variante RFC', () => {
    const id = newId(1_700_000_000_000);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('mantiene l’ordinamento temporale', () => {
    const first = newId(1_700_000_000_000);
    const second = newId(1_700_000_001_000);
    expect(second > first).toBe(true);
  });
});
