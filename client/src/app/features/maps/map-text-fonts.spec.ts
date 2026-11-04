import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Il modulo di produzione non esiste ancora: l'import è dinamico e con
 * specificatore variabile per non bloccare la compilazione degli altri spec.
 * In rosso il test fallisce con un errore esplicito di modulo mancante.
 */
const fontsModulePath = './map-text-fonts.ts';

interface FontModule {
  TEXT_FONT_FAMILIES: readonly string[];
  TEXT_FONT_STACKS: Record<string, string>;
  TEXT_FONT_LABELS: Record<string, string>;
  textFontStack: (family: string) => string;
}

const EXPECTED_FAMILIES = ['sans', 'serif', 'mono', 'display'] as const;

let fonts: FontModule | null = null;

const requireFonts = (): FontModule => {
  if (fonts === null) {
    throw new Error('map-text-fonts.ts assente: impossibile verificare i font');
  }
  return fonts;
};

beforeAll(async () => {
  fonts = await import(fontsModulePath);
});

describe('map-text-fonts', () => {
  it('espone esattamente i quattro font supportati dallo schema', () => {
    const module = requireFonts();

    expect([...module.TEXT_FONT_FAMILIES]).toEqual([...EXPECTED_FAMILIES]);
    expect(new Set(module.TEXT_FONT_FAMILIES).size).toBe(module.TEXT_FONT_FAMILIES.length);
  });

  it('fornisce uno stack non vuoto per ogni font', () => {
    const module = requireFonts();

    for (const family of EXPECTED_FAMILIES) {
      const stack = module.TEXT_FONT_STACKS[family];
      expect(typeof stack, family).toBe('string');
      expect(stack?.trim(), family).not.toBe('');
      // Uno stack contiene più famiglie di fallback, non un singolo font.
      expect(stack, family).toContain(',');
    }
  });

  it('espone una label leggibile e distinta per ogni font', () => {
    const module = requireFonts();
    const labels = EXPECTED_FAMILIES.map((family) => module.TEXT_FONT_LABELS[family]);

    for (const label of labels) {
      expect(typeof label).toBe('string');
      expect(label?.trim()).not.toBe('');
    }
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('textFontStack restituisce lo stack della famiglia richiesta', () => {
    const module = requireFonts();

    for (const family of EXPECTED_FAMILIES) {
      expect(module.textFontStack(family)).toBe(module.TEXT_FONT_STACKS[family]);
    }
  });

  it('non carica font da CDN o URL remoti, solo fallback locali', () => {
    const module = requireFonts();

    for (const family of EXPECTED_FAMILIES) {
      const stack = module.TEXT_FONT_STACKS[family] ?? '';
      expect(stack, family).not.toMatch(/https?:\/\//i);
      expect(stack, family).not.toMatch(/url\(/i);
      expect(stack, family).not.toMatch(/@import/i);
      expect(stack, family).not.toMatch(/cdn/i);
    }
  });
});
