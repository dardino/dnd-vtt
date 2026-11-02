import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ActorSheetPlayerLink } from './actor-sheet-player-link';

describe('ActorSheetPlayerLink', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ActorSheetPlayerLink] });
  });

  const create = (options: {
    url?: string | null;
    editing?: boolean;
    busy?: boolean;
    error?: string | null;
  } = {}) => {
    const fixture = TestBed.createComponent(ActorSheetPlayerLink);
    fixture.componentRef.setInput('url', options.url ?? null);
    fixture.componentRef.setInput('editing', options.editing ?? true);
    fixture.componentRef.setInput('busy', options.busy ?? false);
    fixture.componentRef.setInput('error', options.error ?? null);
    fixture.detectChanges();
    return fixture;
  };

  const buttonByText = (root: HTMLElement, text: string): HTMLButtonElement => {
    const button = Array.from(root.querySelectorAll('button'))
      .find((entry) => entry.textContent?.trim() === text);
    if (button === undefined) {
      throw new Error(`bottone non trovato: ${text}`);
    }
    return button;
  };

  it('non mostra il pannello senza link, errore o sola lettura', () => {
    const fixture = create();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent?.trim()).toBe('');
    expect(root.querySelector('section')).toBeNull();
  });

  it('mostra URL, azioni e stato di modifica con link attivo', () => {
    const fixture = create({ url: 'http://localhost:3000/play/token', editing: true });
    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector('input') as HTMLInputElement;
    const link = root.querySelector('a') as HTMLAnchorElement;

    expect(root.textContent).toContain('Scheda giocatore');
    expect(input.value).toBe('http://localhost:3000/play/token');
    expect(input.readOnly).toBe(true);
    expect(link.getAttribute('href')).toBe('http://localhost:3000/play/token');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(buttonByText(root, 'Spegni matita')).toBeDefined();
    expect(buttonByText(root, 'Copia link')).toBeDefined();
    expect(root.textContent).toContain('Il giocatore può modificare la scheda');
  });

  it('mostra la sola lettura senza URL', () => {
    const fixture = create({ editing: false });
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('input')).toBeNull();
    expect(buttonByText(root, 'Accendi matita')).toBeDefined();
    expect(root.textContent).toContain('Sola lettura');
  });

  it('mostra l’errore e resta visibile senza URL', () => {
    const fixture = create({ error: 'Link non disponibile' });
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('input')).toBeNull();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Link non disponibile');
  });

  it('emette copyRequest e toggleEditing', () => {
    const fixture = create({ url: 'http://localhost:3000/play/token' });
    const root = fixture.nativeElement as HTMLElement;
    let copies = 0;
    let toggles = 0;
    fixture.componentInstance.copyRequest.subscribe(() => {
      copies += 1;
    });
    fixture.componentInstance.toggleEditing.subscribe(() => {
      toggles += 1;
    });

    buttonByText(root, 'Copia link').click();
    buttonByText(root, 'Spegni matita').click();

    expect(copies).toBe(1);
    expect(toggles).toBe(1);
  });

  it('disabilita il toggle quando busy', () => {
    const fixture = create({ url: 'http://localhost:3000/play/token', busy: true });
    const root = fixture.nativeElement as HTMLElement;
    let toggles = 0;
    fixture.componentInstance.toggleEditing.subscribe(() => {
      toggles += 1;
    });

    const toggle = buttonByText(root, 'Spegni matita');
    expect(toggle.disabled).toBe(true);
    toggle.click();
    expect(toggles).toBe(0);
  });
});
