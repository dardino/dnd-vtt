/**
 * Cache dei colori CSS letti da `getComputedStyle`.
 *
 * I token del tema sono definiti su `:root`, quindi la cache è condivisa per
 * tema e per insieme di token: una sola lettura del DOM finché `data-theme`
 * (o la preferenza di sistema) non cambia. Il cambio di tema svuota la cache.
 */

export type ThemeName = 'light' | 'dark';

export interface CssColorToken {
  readonly variable: string;
  readonly fallback: string;
}

export type CssColorTokens = Readonly<Record<string, CssColorToken>>;

export type ResolvedThemeColors<T extends CssColorTokens> = {
  readonly [K in keyof T]: string;
};

let cache = new WeakMap<CssColorTokens, Map<ThemeName, Record<string, string>>>();
let cachedTheme: ThemeName | null = null;

const systemTheme = (): ThemeName =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';

export const resolveTheme = (doc: Document): ThemeName => {
  const explicit = doc.documentElement.dataset['theme'];
  if (explicit === 'light' || explicit === 'dark') {
    return explicit;
  }
  return systemTheme();
};

const syncTheme = (theme: ThemeName): void => {
  if (theme !== cachedTheme) {
    cache = new WeakMap();
    cachedTheme = theme;
  }
};

export function readThemeColors<T extends CssColorTokens>(
  element: Element,
  tokens: T,
): ResolvedThemeColors<T> {
  const theme = resolveTheme(element.ownerDocument);
  syncTheme(theme);

  let themed = cache.get(tokens);
  if (themed === undefined) {
    themed = new Map();
    cache.set(tokens, themed);
  }
  const cached = themed.get(theme);
  if (cached !== undefined) {
    return cached as ResolvedThemeColors<T>;
  }

  const view = element.ownerDocument.defaultView;
  const style = view === null ? getComputedStyle(element) : view.getComputedStyle(element);
  const resolved: Record<string, string> = {};
  for (const [key, token] of Object.entries(tokens)) {
    resolved[key] = style.getPropertyValue(token.variable).trim() || token.fallback;
  }
  themed.set(theme, resolved);
  return resolved as ResolvedThemeColors<T>;
}

/** Solo per i test: riparte da una cache vuota. */
export function clearThemeColorsCache(): void {
  cache = new WeakMap();
  cachedTheme = null;
}
