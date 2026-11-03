import { HttpErrorResponse } from '@angular/common/http';
import { ApplicationRef } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { PlayerLink } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerService } from '../../core/services/player.service';
import { ActorSheetPlayerLink } from './actor-sheet-player-link';

const ACTOR_ID = '0190f000-0000-7000-8000-000000000010';
const CAMPAIGN_ID = '0190f000-0000-7000-8000-000000000001';
const CREATED_AT = '2026-11-03T10:00:00.000Z';

const deferred = <T>(): { promise: Promise<T>; resolve: (value: T) => void } => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
};

const playerLink = (editingEnabled = true): PlayerLink => ({
  id: '0190f000-0000-7000-8000-000000000020',
  campaignId: CAMPAIGN_ID,
  actorId: ACTOR_ID,
  label: null,
  editingEnabled,
  createdAt: CREATED_AT,
  lastSeenAt: null,
  revokedAt: null,
});

/**
 * jsdom non implementa l'API modale di `<dialog>`: il polyfill riproduce il
 * comportamento essenziale del browser (attributo `open` + evento `close`).
 */
const installDialogPolyfill = (): void => {
  HTMLDialogElement.prototype.showModal = function showModal(): void {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(): void {
    if (!this.open) {
      return;
    }
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
};

describe('ActorSheetPlayerLink', () => {
  let getLink: ReturnType<typeof vi.fn>;
  let createLink: ReturnType<typeof vi.fn>;
  let setEditing: ReturnType<typeof vi.fn>;
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    installDialogPolyfill();
    getLink = vi.fn(() => Promise.resolve(null));
    createLink = vi.fn(() => Promise.resolve({
      link: playerLink(),
      token: 'token-nuovo',
      url: 'http://192.168.1.50:3000/play/token-nuovo',
    }));
    setEditing = vi.fn((_actorId: string, editingEnabled: boolean) =>
      Promise.resolve(playerLink(editingEnabled)));
    writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    TestBed.configureTestingModule({
      imports: [ActorSheetPlayerLink],
      providers: [
        { provide: PlayerService, useValue: { getLink, createLink, setEditing } },
      ],
    });
  });

  const settle = async (fixture: ComponentFixture<ActorSheetPlayerLink>): Promise<void> => {
    await Promise.resolve();
    await TestBed.inject(ApplicationRef).whenStable();
    fixture.detectChanges();
  };

  const create = async (): Promise<ComponentFixture<ActorSheetPlayerLink>> => {
    const fixture = TestBed.createComponent(ActorSheetPlayerLink);
    fixture.componentRef.setInput('actorId', ACTOR_ID);
    fixture.detectChanges();
    await settle(fixture);
    return fixture;
  };

  const rootOf = (fixture: ComponentFixture<ActorSheetPlayerLink>): HTMLElement =>
    fixture.nativeElement as HTMLElement;

  const buttonByText = (root: HTMLElement, text: string): HTMLButtonElement => {
    const button = Array.from(root.querySelectorAll('button'))
      .find((entry) => entry.textContent?.trim() === text);
    if (button === undefined) {
      throw new Error(`bottone non trovato: ${text}`);
    }
    return button;
  };

  it('senza link mostra solo Condividi scheda', async () => {
    const fixture = await create();
    const root = rootOf(fixture);

    expect(getLink).toHaveBeenCalledWith(ACTOR_ID);
    expect(root.textContent).toContain('Scheda giocatore');
    expect(buttonByText(root, 'Condividi scheda')).toBeDefined();
    expect(root.querySelector('app-qr-code')).toBeNull();
    expect(root.querySelector('input')).toBeNull();
    expect(root.textContent).not.toContain('Link attivo');
  });

  it('crea il link e mostra URL e QR', async () => {
    const fixture = await create();
    const root = rootOf(fixture);

    buttonByText(root, 'Condividi scheda').click();
    await settle(fixture);

    expect(createLink).toHaveBeenCalledWith(ACTOR_ID);
    const input = root.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('http://192.168.1.50:3000/play/token-nuovo');
    expect(input.readOnly).toBe(true);
    expect(root.querySelector('app-qr-code')).not.toBeNull();
    expect(root.querySelector('app-qr-code svg')).not.toBeNull();
    expect(buttonByText(root, 'Copia link')).toBeDefined();
    expect(buttonByText(root, 'Rigenera link e QR')).toBeDefined();
    expect(buttonByText(root, 'Spegni matita')).toBeDefined();
  });

  it('con link esistente senza URL chiede Rigenera', async () => {
    getLink.mockResolvedValue(playerLink(true));
    const fixture = await create();
    const root = rootOf(fixture);

    expect(root.textContent).toContain('Link attivo');
    expect(buttonByText(root, 'Rigenera link e QR')).toBeDefined();
    expect(buttonByText(root, 'Spegni matita')).toBeDefined();
    expect(root.querySelector('app-qr-code')).toBeNull();
    expect(root.querySelector('input')).toBeNull();
  });

  it('annulla la rigenerazione senza chiamare createLink', async () => {
    getLink.mockResolvedValue(playerLink(true));
    const fixture = await create();
    const root = rootOf(fixture);

    buttonByText(root, 'Rigenera link e QR').click();
    fixture.detectChanges();
    const dialog = root.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('Rigenera link e QR');

    buttonByText(root, 'Annulla').click();
    await settle(fixture);

    expect(createLink).not.toHaveBeenCalled();
    expect(dialog.open).toBe(false);
  });

  it('conferma la rigenerazione creando un nuovo link', async () => {
    getLink.mockResolvedValue(playerLink(false));
    const fixture = await create();
    const root = rootOf(fixture);

    buttonByText(root, 'Rigenera link e QR').click();
    fixture.detectChanges();
    buttonByText(root, 'Conferma').click();
    await settle(fixture);

    expect(createLink).toHaveBeenCalledWith(ACTOR_ID);
    const input = root.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('http://192.168.1.50:3000/play/token-nuovo');
    expect(root.querySelector('app-qr-code')).not.toBeNull();
    expect(buttonByText(root, 'Spegni matita')).toBeDefined();
  });

  it('avvisa quando il link usa un host loopback', async () => {
    createLink.mockResolvedValue({
      link: playerLink(),
      token: 'token-loopback',
      url: 'http://localhost:3000/play/token-loopback',
    });
    const fixture = await create();
    const root = rootOf(fixture);

    buttonByText(root, 'Condividi scheda').click();
    await settle(fixture);

    const warning = root.querySelector('[role="status"]');
    expect(warning?.textContent).toContain('PUBLIC_URL');
    expect(warning?.textContent).toContain('IP LAN del server');
  });

  it('azzera URL e QR quando cambia attore', async () => {
    const fixture = await create();
    const root = rootOf(fixture);
    buttonByText(root, 'Condividi scheda').click();
    await settle(fixture);
    expect(root.querySelector('input')).not.toBeNull();

    getLink.mockResolvedValue(null);
    fixture.componentRef.setInput('actorId', '0190f000-0000-7000-8000-000000000011');
    await settle(fixture);

    expect(root.querySelector('input')).toBeNull();
    expect(root.querySelector('app-qr-code')).toBeNull();
    expect(buttonByText(root, 'Condividi scheda')).toBeDefined();
  });

  it("mostra l'errore di creazione e torna non occupato", async () => {
    createLink.mockRejectedValue(new HttpErrorResponse({ status: 500 }));
    const fixture = await create();
    const root = rootOf(fixture);

    buttonByText(root, 'Condividi scheda').click();
    await settle(fixture);

    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'Impossibile caricare il link giocatore.',
    );
    expect(fixture.componentInstance.busy()).toBe(false);
    expect(root.querySelector('app-qr-code')).toBeNull();
  });

  it('mostra un errore di caricamento con il fallback italiano', async () => {
    getLink.mockRejectedValue(new HttpErrorResponse({ status: 500 }));
    const fixture = await create();
    const root = rootOf(fixture);

    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'Impossibile caricare il link giocatore.',
    );
  });

  it('spegne e riaccende la matita tramite setEditing', async () => {
    getLink.mockResolvedValue(playerLink(true));
    const fixture = await create();
    const root = rootOf(fixture);

    buttonByText(root, 'Spegni matita').click();
    await settle(fixture);

    expect(setEditing).toHaveBeenCalledWith(ACTOR_ID, false);
    expect(root.textContent).toContain('Sola lettura');
    expect(buttonByText(root, 'Accendi matita')).toBeDefined();
  });

  it('copia il link creato negli appunti', async () => {
    const fixture = await create();
    const root = rootOf(fixture);

    buttonByText(root, 'Condividi scheda').click();
    await settle(fixture);
    expect(writeText).toHaveBeenCalledWith('http://192.168.1.50:3000/play/token-nuovo');

    writeText.mockClear();
    buttonByText(root, 'Copia link').click();
    await settle(fixture);
    expect(writeText).toHaveBeenCalledWith('http://192.168.1.50:3000/play/token-nuovo');
  });

  it('chiede la copia manuale quando la clipboard non esiste', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const fixture = await create();
    const root = rootOf(fixture);

    buttonByText(root, 'Condividi scheda').click();
    await settle(fixture);

    expect(root.textContent).toContain('URL selezionato: copialo manualmente.');
  });

  it('chiede la copia manuale quando la clipboard rifiuta', async () => {
    writeText.mockRejectedValue(new Error('non consentito'));
    const fixture = await create();
    const root = rootOf(fixture);

    buttonByText(root, 'Condividi scheda').click();
    await settle(fixture);

    expect(root.textContent).toContain('URL selezionato: copialo manualmente.');
  });

  it('scarta la creazione se nel frattempo cambia l’attore', async () => {
    const pending = deferred<{
      link: PlayerLink;
      token: string;
      url: string;
    }>();
    createLink.mockReturnValue(pending.promise);
    const fixture = await create();
    const root = rootOf(fixture);

    buttonByText(root, 'Condividi scheda').click();
    getLink.mockResolvedValue(null);
    fixture.componentRef.setInput('actorId', '0190f000-0000-7000-8000-000000000011');
    await settle(fixture);

    pending.resolve({
      link: playerLink(),
      token: 'token-vecchio',
      url: 'http://192.168.1.50:3000/play/token-vecchio',
    });
    await settle(fixture);

    expect(root.querySelector('input')).toBeNull();
    expect(root.querySelector('app-qr-code')).toBeNull();
    expect(buttonByText(root, 'Condividi scheda')).toBeDefined();
  });

  it('scarta il toggle matita se nel frattempo cambia l’attore', async () => {
    getLink.mockResolvedValue(playerLink(true));
    const pending = deferred<PlayerLink | null>();
    setEditing.mockReturnValue(pending.promise);
    const fixture = await create();
    const root = rootOf(fixture);

    buttonByText(root, 'Spegni matita').click();
    getLink.mockResolvedValue(null);
    fixture.componentRef.setInput('actorId', '0190f000-0000-7000-8000-000000000011');
    await settle(fixture);
    pending.resolve(playerLink(false));
    await settle(fixture);

    expect(root.textContent).toContain('Condividi scheda');
    expect(root.textContent).not.toContain('Sola lettura');
  });
});
