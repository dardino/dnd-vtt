import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { MapSummary } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MapPickerDialog } from './map-picker-dialog';

const CAMPAIGN_ID = '0190f000-0000-7000-8000-000000000001';
const MAP_ID = '0190f000-0000-7000-8000-000000000002';
const OTHER_ID = '0190f000-0000-7000-8000-000000000003';

const summary = (overrides: Partial<MapSummary> = {}): MapSummary => ({
  id: MAP_ID,
  campaignId: CAMPAIGN_ID,
  name: 'Ingresso',
  imageAssetId: null,
  imageUrl: null,
  thumbUrl: null,
  backgroundColor: 'rgba(255, 255, 255, 1)',
  widthPx: 1920,
  heightPx: 1080,
  grid: {
    type: 'square',
    cellSizePx: 70,
    offsetX: 0,
    offsetY: 0,
    feetPerCell: 5,
    diagonalRule: '5-5-5',
    hexOffset: 'odd-r',
  },
  fogBase: 'hidden',
  version: 1,
  walls: 2,
  lights: 3,
  spawns: 4,
  playerStarts: 5,
  updatedAt: '2026-11-03T10:00:00.000Z',
  ...overrides,
});

describe('MapPickerDialog', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.open = false;
    });
    TestBed.configureTestingModule({
      imports: [MapPickerDialog],
      providers: [provideRouter([])],
    });
  });

  const create = (options: {
    open?: boolean;
    maps?: readonly MapSummary[];
    loading?: boolean;
  } = {}): ComponentFixture<MapPickerDialog> => {
    const fixture = TestBed.createComponent(MapPickerDialog);
    fixture.componentRef.setInput('open', options.open ?? true);
    fixture.componentRef.setInput('maps', options.maps ?? [summary()]);
    fixture.componentRef.setInput('loading', options.loading ?? false);
    fixture.detectChanges();
    return fixture;
  };

  const rootOf = (fixture: ComponentFixture<MapPickerDialog>): HTMLElement =>
    fixture.nativeElement as HTMLElement;

  it('apre e chiude il dialog in base a open', () => {
    expect(rootOf(create()).querySelector('dialog')?.open).toBe(true);
    expect(rootOf(create({ open: false })).querySelector('dialog')?.open).toBe(false);
  });

  it('mostra caricamento e stato vuoto', () => {
    const loading = rootOf(create({ maps: [], loading: true }));
    expect(loading.textContent).toContain('Caricamento mappe…');
    expect(loading.querySelectorAll('.screen-row')).toHaveLength(0);

    const empty = rootOf(create({ maps: [] }));
    expect(empty.textContent).toContain('Nessuna mappa disponibile');
    expect(empty.textContent).toContain('Chiudi');
  });

  it('mostra le mappe con griglia e conteggi', () => {
    const fixture = create({
      maps: [
        summary(),
        summary({ id: OTHER_ID, name: 'Cripta', grid: { ...summary().grid, type: 'hex' }, playerStarts: 0 }),
      ],
    });
    const rows = rootOf(fixture).querySelectorAll('.screen-row');

    expect(rootOf(fixture).querySelector('.dialog__title')?.textContent).toBe('Crea scena');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.querySelector('strong')?.textContent).toBe('Ingresso');
    expect(rows[0]?.querySelector('.badge')?.textContent).toBe('quadrata');
    expect(rows[0]?.textContent).toContain('1920 × 1080 px');
    expect(rows[0]?.textContent).toContain('5 partenze');
    expect(rows[1]?.querySelector('.badge')?.textContent).toBe('esagonale');
    expect(rows[1]?.textContent).toContain('0 partenze');
  });

  it('emette la mappa scelta', () => {
    const fixture = create({ maps: [summary(), summary({ id: OTHER_ID, name: 'Cripta' })] });
    const chosen = vi.fn<(value: MapSummary) => void>();
    fixture.componentInstance.choose.subscribe(chosen);

    const rows = rootOf(fixture).querySelectorAll('.screen-row');
    (rows[1] as HTMLButtonElement).click();

    expect(chosen).toHaveBeenCalledTimes(1);
    expect(chosen.mock.calls[0]?.[0]?.id).toBe(OTHER_ID);
  });

  it('emette create e closed dai pulsanti', () => {
    const fixture = create();
    const createMap = vi.fn();
    const closed = vi.fn();
    fixture.componentInstance.create.subscribe(createMap);
    fixture.componentInstance.closed.subscribe(closed);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    const link = Array.from(rootOf(fixture).querySelectorAll('a'))
      .find((entry) => entry.textContent?.trim() === 'Crea mappa');
    link?.click();
    const cancel = Array.from(rootOf(fixture).querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Annulla');
    cancel?.click();

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(String(navigate.mock.calls[0]?.[0])).toBe('/maps');
    expect(createMap).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledTimes(1);
  });
});
