import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import type { TokenState } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenList } from './token-list';

const token = (
  id: string,
  label: string,
  overrides: Partial<TokenState> = {},
): TokenState => ({
  id,
  actorId: '0190f000-0000-7000-8000-000000000002',
  label,
  x: 0,
  y: 0,
  size: 1,
  rotation: 0,
  elevation: 0,
  hp: { current: 7, max: 10, temp: 0 },
  conditions: [],
  visible: true,
  owner: 'dm',
  ...overrides,
});

describe('TokenList', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TokenList] });
  });

  const create = (options: {
    tokens: readonly TokenState[];
    selectedTokenId?: string | null;
  }): ComponentFixture<TokenList> => {
    const fixture = TestBed.createComponent(TokenList);
    fixture.componentRef.setInput('tokens', options.tokens);
    fixture.componentRef.setInput('selectedTokenId', options.selectedTokenId ?? null);
    fixture.detectChanges();
    return fixture;
  };

  const rows = (fixture: ComponentFixture<TokenList>): NodeListOf<HTMLLIElement> =>
    (fixture.nativeElement as HTMLElement).querySelectorAll('.token-row');

  it('mostra il messaggio di vuoto senza creare la lista', () => {
    const fixture = create({ tokens: [] });
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('.token-list')).toBeNull();
    expect(root.querySelector('p.muted')?.textContent).toContain(
      'Nessun token. Trascina uno slot o un attore sulla mappa.',
    );
  });

  it('mostra nome e PF per ogni token', () => {
    const fixture = create({ tokens: [token('t1', 'Goblin'), token('t2', 'Orco')] });
    const items = rows(fixture);

    expect(items).toHaveLength(2);
    expect(items[0]?.querySelector('.token-row__name')?.textContent).toContain('Goblin');
    expect(items[0]?.querySelector('.token-row__name')?.textContent).toContain('7/10 PF');
    expect(items[1]?.querySelector('.token-row__name')?.textContent).toContain('Orco');
  });

  it('marca la riga del token selezionato', () => {
    const fixture = create({
      tokens: [token('t1', 'Goblin'), token('t2', 'Orco')],
      selectedTokenId: 't2',
    });
    const items = rows(fixture);

    expect(items[0]?.classList.contains('is-selected')).toBe(false);
    expect(items[1]?.classList.contains('is-selected')).toBe(true);
  });

  it('emette center al click sul nome', () => {
    const fixture = create({ tokens: [token('t1', 'Goblin')] });
    const emitted = vi.fn<(value: TokenState) => void>();
    fixture.componentInstance.center.subscribe(emitted);
    const button = (fixture.nativeElement as HTMLElement).querySelector(
      '.token-row__name',
    ) as HTMLButtonElement;

    button.click();

    expect(emitted).toHaveBeenCalledTimes(1);
    expect(emitted.mock.calls[0]?.[0].id).toBe('t1');
  });

  it('emette changeHp con delta -5 e +5', () => {
    const fixture = create({ tokens: [token('t1', 'Goblin')] });
    const emitted = vi.fn<(value: { token: TokenState; delta: number }) => void>();
    fixture.componentInstance.changeHp.subscribe(emitted);
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '.token-row__icon',
    );

    (buttons[0] as HTMLButtonElement).click();
    (buttons[1] as HTMLButtonElement).click();

    expect(emitted).toHaveBeenCalledTimes(2);
    expect(emitted.mock.calls[0]?.[0]).toMatchObject({ delta: -5 });
    expect(emitted.mock.calls[0]?.[0].token.id).toBe('t1');
    expect(emitted.mock.calls[1]?.[0]).toMatchObject({ delta: 5 });
  });

  it('emette toggleVisibility con il token', () => {
    const fixture = create({ tokens: [token('t1', 'Goblin')] });
    const emitted = vi.fn<(value: TokenState) => void>();
    fixture.componentInstance.toggleVisibility.subscribe(emitted);
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '.token-row__icon',
    );

    (buttons[2] as HTMLButtonElement).click();

    expect(emitted).toHaveBeenCalledTimes(1);
    expect(emitted.mock.calls[0]?.[0].id).toBe('t1');
    expect(buttons[2]?.textContent).toContain('visibility');
  });

  it('emette remove con il token', () => {
    const fixture = create({ tokens: [token('t1', 'Goblin')] });
    const emitted = vi.fn<(value: TokenState) => void>();
    fixture.componentInstance.remove.subscribe(emitted);
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '.token-row__icon',
    );

    (buttons[3] as HTMLButtonElement).click();

    expect(emitted).toHaveBeenCalledTimes(1);
    expect(emitted.mock.calls[0]?.[0].id).toBe('t1');
  });

  it('mantiene aria-label e title dei pulsanti', () => {
    const fixture = create({ tokens: [token('t1', 'Goblin', { visible: false })] });
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '.token-row__icon',
    );

    expect(buttons[0]?.getAttribute('aria-label')).toBe('Danneggia Goblin di 5');
    expect(buttons[0]?.getAttribute('title')).toBe('Danneggia 5');
    expect(buttons[1]?.getAttribute('aria-label')).toBe('Cura Goblin di 5');
    expect(buttons[1]?.getAttribute('title')).toBe('Cura 5');
    expect(buttons[2]?.getAttribute('aria-label')).toBe('Mostra Goblin');
    expect(buttons[2]?.textContent).toContain('visibility_off');
    expect(buttons[3]?.getAttribute('aria-label')).toBe('Rimuovi Goblin');
  });
});
