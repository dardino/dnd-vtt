import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import type { Campaign, Map, MapSummary } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CampaignService } from '../../core/services/campaign.service';
import { LastCampaignService } from '../../core/services/last-campaign.service';
import { MapService } from '../../core/services/map.service';
import { MapsPage } from './maps.page';

const campaign = {
  id: '7f1b0d2c-3e4a-4b5c-8d9e-0a1b2c3d4e5f',
  name: 'Campagna di prova',
} as Campaign;

const createdMap = { id: 'map-1' } as Map;

// jsdom non implementa l'API modale di `<dialog>`.
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

const renderPage = (): ComponentFixture<MapsPage> => {
  const fixture = TestBed.createComponent(MapsPage);
  fixture.componentInstance.campaign.set(campaign);
  fixture.detectChanges();
  return fixture;
};

const openCreateDialog = (fixture: ComponentFixture<MapsPage>): void => {
  fixture.componentInstance.openCreateDialog();
  fixture.detectChanges();
};

const nameInput = (fixture: ComponentFixture<MapsPage>): HTMLInputElement =>
  (fixture.nativeElement as HTMLElement).querySelector('.create-dialog input') as HTMLInputElement;

const createSelects = (fixture: ComponentFixture<MapsPage>): HTMLSelectElement[] =>
  Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLSelectElement>(
      '.create-dialog select',
    ),
  );

describe('MapsPage creazione con preset', () => {
  const create = vi.fn();
  const navigate = vi.fn();

  beforeEach(() => {
    installDialogPolyfill();
    create.mockReset();
    create.mockResolvedValue(createdMap);
    navigate.mockReset();
    navigate.mockResolvedValue(true);

    TestBed.configureTestingModule({
      providers: [
        { provide: CampaignService, useValue: { list: vi.fn().mockResolvedValue([campaign]) } },
        {
          provide: MapService,
          useValue: { create, list: vi.fn().mockResolvedValue([]) },
        },
        {
          provide: LastCampaignService,
          useValue: { read: vi.fn().mockReturnValue(null), write: vi.fn() },
        },
        { provide: Router, useValue: { navigate } },
        { provide: ActivatedRoute, useValue: {} },
      ],
    });
  });

  it('invia nome, preset e orientamento senza immagine', async () => {
    const fixture = TestBed.createComponent(MapsPage);
    const page = fixture.componentInstance;
    page.campaign.set(campaign);

    page.openCreateDialog();
    page.draftName.set('Cripta');
    page.setPreset('4k');
    page.setOrientation('portrait');
    await page.createMap();

    expect(create).toHaveBeenCalledWith(campaign.id, {
      name: 'Cripta',
      preset: '4k',
      orientation: 'portrait',
    });
    expect(navigate).toHaveBeenCalledWith(['/maps', createdMap.id]);
    expect(page.createOpen()).toBe(false);

    fixture.destroy();
  });

  it('forza landscape e disabilita portrait sui preset ultrawide', () => {
    const fixture = TestBed.createComponent(MapsPage);
    const page = fixture.componentInstance;
    page.campaign.set(campaign);

    page.openCreateDialog();
    page.setOrientation('portrait');
    expect(page.draftOrientation()).toBe('portrait');

    page.setPreset('ultrawide-1080p');
    expect(page.portraitUnavailable()).toBe(true);
    expect(page.draftOrientation()).toBe('landscape');

    page.setOrientation('portrait');
    expect(page.draftOrientation()).toBe('landscape');
    expect(page.createResolution()).toEqual({ widthPx: 2560, heightPx: 1080 });

    fixture.destroy();
  });

  it('mostra l\'errore dentro il dialog di creazione se fallisce', async () => {
    const fixture = TestBed.createComponent(MapsPage);
    const page = fixture.componentInstance;
    page.campaign.set(campaign);
    create.mockRejectedValue(new Error('boom'));

    page.openCreateDialog();
    await page.createMap();
    fixture.detectChanges();

    const dialog = (fixture.nativeElement as HTMLElement).querySelector('dialog');
    const alert = dialog?.querySelector('[role="alert"]');

    expect(page.createOpen()).toBe(true);
    expect(page.busy()).toBe(false);
    expect(page.createError()).toBe('Operazione non riuscita.');
    expect(alert?.textContent).toContain('Operazione non riuscita.');

    fixture.destroy();
  });

  it('blocca il submit con nome vuoto e segna il campo touched', async () => {
    const fixture = renderPage();
    const page = fixture.componentInstance;
    openCreateDialog(fixture);

    const input = nameInput(fixture);
    input.value = '';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(page.draftName()).toBe('');

    await page.createMap();
    fixture.detectChanges();

    expect(create).not.toHaveBeenCalled();
    expect(page.createOpen()).toBe(true);
    expect(page.createForm.name().touched()).toBe(true);
    expect(page.createForm.name().invalid()).toBe(true);
    const error = (fixture.nativeElement as HTMLElement).querySelector('#map-name-error');
    expect(error?.textContent).toContain('Inserisci un nome');

    fixture.destroy();
  });

  it('mostra errore e attributi aria solo dopo il blur', () => {
    const fixture = renderPage();
    openCreateDialog(fixture);

    const input = nameInput(fixture);
    const root = fixture.nativeElement as HTMLElement;
    input.value = '';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(root.querySelector('#map-name-error')).toBeNull();
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBeNull();

    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(root.querySelector('#map-name-error')?.textContent).toContain('Inserisci un nome');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('map-name-error');

    fixture.destroy();
  });

  it('rifiuta un nome oltre 120 caratteri', () => {
    const fixture = renderPage();
    const page = fixture.componentInstance;
    openCreateDialog(fixture);

    page.draftName.set('a'.repeat(121));
    fixture.detectChanges();

    expect(page.createForm.name().invalid()).toBe(true);
    expect(page.createForm.name().errors()[0]?.message).toContain('120');

    fixture.destroy();
  });

  it('traccia dirty e touched del nome', () => {
    const fixture = renderPage();
    const page = fixture.componentInstance;
    openCreateDialog(fixture);

    const input = nameInput(fixture);
    input.value = 'Cripta';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(page.createForm.name().dirty()).toBe(true);
    expect(page.createForm.name().touched()).toBe(false);

    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(page.createForm.name().touched()).toBe(true);

    fixture.destroy();
  });

  it('invia dal form i valori selezionati', async () => {
    const fixture = renderPage();
    const page = fixture.componentInstance;
    openCreateDialog(fixture);

    const input = nameInput(fixture);
    input.value = 'Cripta';
    input.dispatchEvent(new Event('input'));

    const [presetSelect, orientationSelect] = createSelects(fixture);
    presetSelect!.value = '4k';
    presetSelect!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    orientationSelect!.value = 'portrait';
    orientationSelect!.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    await page.createMap();

    expect(create).toHaveBeenCalledWith(campaign.id, {
      name: 'Cripta',
      preset: '4k',
      orientation: 'portrait',
    });
    expect(navigate).toHaveBeenCalledWith(['/maps', createdMap.id]);
    expect(page.createOpen()).toBe(false);

    fixture.destroy();
  });

  it('forza landscape quando si seleziona un preset ultrawide', () => {
    const fixture = renderPage();
    const page = fixture.componentInstance;
    openCreateDialog(fixture);

    const [presetSelect, orientationSelect] = createSelects(fixture);
    presetSelect!.value = 'ultrawide-1080p';
    presetSelect!.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(page.draftPreset()).toBe('ultrawide-1080p');
    expect(page.portraitUnavailable()).toBe(true);
    expect(page.draftOrientation()).toBe('landscape');
    expect(orientationSelect!.value).toBe('landscape');

    fixture.destroy();
  });

  it('mostra la risoluzione nella card', () => {
    const fixture = TestBed.createComponent(MapsPage);
    const page = fixture.componentInstance;
    const map = { widthPx: 1920, heightPx: 1080 } as MapSummary;

    expect(page.resolution(map)).toBe('1920×1080');

    fixture.destroy();
  });
});
