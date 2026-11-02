import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearThemeColorsCache,
  readThemeColors,
  resolveTheme,
  type CssColorTokens,
} from './theme-colors';

const TOKENS = {
  text: { variable: '--color-text', fallback: '#e8e8e8' },
  surface: { variable: '--color-bg-raised', fallback: '#242424' },
} as const satisfies CssColorTokens;

const styleMock = (values: Readonly<Record<string, string>>): CSSStyleDeclaration => ({
  getPropertyValue: (name: string): string => values[name] ?? '',
}) as unknown as CSSStyleDeclaration;

describe('readThemeColors', () => {
  let element: HTMLElement;

  beforeEach(() => {
    clearThemeColorsCache();
    document.documentElement.dataset['theme'] = 'light';
    element = document.createElement('div');
    document.body.append(element);
  });

  afterEach(() => {
    element.remove();
    delete document.documentElement.dataset['theme'];
    clearThemeColorsCache();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('legge i token una sola volta per tema (cache hit)', () => {
    const spy = vi.spyOn(window, 'getComputedStyle')
      .mockReturnValue(styleMock({ '--color-text': ' #123456 ', '--color-bg-raised': '#abcdef' }));

    const first = readThemeColors(element, TOKENS);
    const second = readThemeColors(element, TOKENS);

    expect(first).toEqual({ text: '#123456', surface: '#abcdef' });
    expect(second).toBe(first);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('usa i fallback quando il token non è definito', () => {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue(styleMock({}));

    expect(readThemeColors(element, TOKENS)).toEqual({
      text: '#e8e8e8',
      surface: '#242424',
    });
  });

  it('invalida la cache quando cambia data-theme', () => {
    const spy = vi.spyOn(window, 'getComputedStyle')
      .mockReturnValue(styleMock({ '--color-text': '#light' }));

    readThemeColors(element, TOKENS);
    expect(spy).toHaveBeenCalledTimes(1);

    document.documentElement.dataset['theme'] = 'dark';
    expect(readThemeColors(element, TOKENS).text).toBe('#light');
    expect(spy).toHaveBeenCalledTimes(2);

    document.documentElement.dataset['theme'] = 'light';
    readThemeColors(element, TOKENS);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('risolve il tema da prefers-color-scheme senza data-theme', () => {
    delete document.documentElement.dataset['theme'];
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));

    expect(resolveTheme(document)).toBe('dark');
  });
});
