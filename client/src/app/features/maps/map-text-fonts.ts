/**
 * Font disponibili per le grafiche di testo.
 *
 * Le famiglie sono chiavi stabili dello schema: qui vengono risolte in stack
 * CSS di soli font locali, senza CDN né `@import`, così l'editor funziona
 * offline e non introduce richieste remote.
 */
export const TEXT_FONT_FAMILIES = ['sans', 'serif', 'mono', 'display'] as const;

export type TextFontFamily = (typeof TEXT_FONT_FAMILIES)[number];

export const TEXT_FONT_STACKS: Record<TextFontFamily, string> = {
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', Times, serif",
  mono: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
  display: "'Trebuchet MS', 'Gill Sans', 'Segoe UI', Candara, sans-serif",
};

export const TEXT_FONT_LABELS: Record<TextFontFamily, string> = {
  sans: 'Sans serif',
  serif: 'Serif',
  mono: 'Monospace',
  display: 'Display',
};

/** Stack CSS della famiglia richiesta; una chiave sconosciuta ricade su `sans`. */
export const textFontStack = (family: string): string =>
  TEXT_FONT_STACKS[family as TextFontFamily] ?? TEXT_FONT_STACKS.sans;
