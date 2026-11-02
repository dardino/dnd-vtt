import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import type { Campaign, Map, MapSummary } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CampaignService } from '../../core/campaign.service';
import { LastCampaignService } from '../../core/last-campaign.service';
import { MapService } from '../../core/map.service';
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
        { provide: CampaignService, useValue: { list: vi.fn().mockResolvedValue([]) } },
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

  it('mostra la risoluzione nella card', () => {
    const fixture = TestBed.createComponent(MapsPage);
    const page = fixture.componentInstance;
    const map = { widthPx: 1920, heightPx: 1080 } as MapSummary;

    expect(page.resolution(map)).toBe('1920×1080');

    fixture.destroy();
  });
});
