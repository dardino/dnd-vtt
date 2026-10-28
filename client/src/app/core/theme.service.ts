import { DOCUMENT, Injectable, computed, effect, inject, signal } from '@angular/core';

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'dnd-vtt.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly media = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : undefined;

  private readonly systemDark = signal(this.media?.matches ?? false);

  public readonly theme = signal<Theme>(this.readStoredTheme());
  public readonly resolved = computed<'light' | 'dark'>(() => {
    const theme = this.theme();
    if (theme === 'system') {
      return this.systemDark() ? 'dark' : 'light';
    }
    return theme;
  });

  public constructor() {
    this.media?.addEventListener('change', (event) => this.systemDark.set(event.matches));
    effect(() => {
      const resolved = this.resolved();
      this.document.documentElement.dataset['theme'] = resolved;
      this.document.documentElement.style.colorScheme = resolved;
    });
    effect(() => {
      try {
        localStorage.setItem(STORAGE_KEY, this.theme());
      } catch {
        // localStorage può essere disabilitato: il tema resta valido per la sessione
      }
    });
  }

  public set(theme: Theme): void {
    this.theme.set(theme);
  }

  public cycle(): void {
    const order: Theme[] = ['light', 'dark', 'system'];
    const current = order.indexOf(this.theme());
    this.set(order[(current + 1) % order.length] ?? 'system');
  }

  private readStoredTheme(): Theme {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    } catch {
      return 'system';
    }
  }
}
