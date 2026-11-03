import { computed, signal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type { Display, Viewport } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegiaStore } from './regia.store';
import type { ScreenSummary } from './regia-summary';
import { ScreenViewerDialog } from './screen-viewer-dialog';

const CAMPAIGN_ID = '0190f000-0000-7000-8000-000000000001';
const DISPLAY_ID = '0190f000-0000-7000-8000-000000000002';

const display = (): Display => ({
  id: DISPLAY_ID,
  campaignId: CAMPAIGN_ID,
  code: 'ABCD1234',
  label: 'Schermo giocatori',
  compositionVersion: 1,
  viewportWidth: 1920,
  viewportHeight: 1080,
  createdAt: '2026-11-03T10:00:00.000Z',
  lastSeenAt: '2026-11-03T10:00:00.000Z',
  revokedAt: null,
});

const summary = (): ScreenSummary => ({ display: display(), state: null });

interface RegiaMock {
  screenDialog: ReturnType<typeof signal<ScreenSummary | null>>;
  screenViewport: ReturnType<typeof signal<Viewport | null>>;
  screenZoomLabel: ReturnType<typeof computed<number>>;
  screenAspect: ReturnType<typeof computed<string>>;
  projectionLabel: (value: ScreenSummary) => string;
  lastSeen: (value: ScreenSummary) => string;
  zoomBy: ReturnType<typeof vi.fn>;
  resetView: ReturnType<typeof vi.fn>;
  startPan: ReturnType<typeof vi.fn>;
  movePan: ReturnType<typeof vi.fn>;
  endPan: ReturnType<typeof vi.fn>;
  closeScreenDialog: ReturnType<typeof vi.fn>;
}

const createRegia = (): RegiaMock => {
  const dialog = signal<ScreenSummary | null>(summary());
  const viewport = signal<Viewport | null>({ x: 960, y: 540, zoom: 1 });
  return {
    screenDialog: dialog,
    screenViewport: viewport,
    screenZoomLabel: computed(() => Math.round((viewport()?.zoom ?? 1) * 100)),
    screenAspect: computed(() => '16 / 9'),
    projectionLabel: (value) => `Proiezione ${value.display.code}`,
    lastSeen: () => 'visto ora',
    zoomBy: vi.fn((factor: number) => {
      viewport.update((current) => current === null
        ? current
        : { ...current, zoom: current.zoom * factor });
    }),
    resetView: vi.fn(() => viewport.set({ x: 960, y: 540, zoom: 1 })),
    startPan: vi.fn(),
    movePan: vi.fn(),
    endPan: vi.fn(),
    closeScreenDialog: vi.fn(() => dialog.set(null)),
  };
};

describe('ScreenViewerDialog', () => {
  let regia: RegiaMock;

  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.open = false;
    });
    regia = createRegia();
    TestBed.configureTestingModule({
      imports: [ScreenViewerDialog],
      providers: [{ provide: RegiaStore, useValue: regia }],
    });
  });

  const create = (): ComponentFixture<ScreenViewerDialog> => {
    const fixture = TestBed.createComponent(ScreenViewerDialog);
    fixture.detectChanges();
    return fixture;
  };

  const rootOf = (fixture: ComponentFixture<ScreenViewerDialog>): HTMLElement =>
    fixture.nativeElement as HTMLElement;

  const viewerOf = (fixture: ComponentFixture<ScreenViewerDialog>): HTMLElement =>
    rootOf(fixture).querySelector('.screen-viewer') as HTMLElement;

  it('è aperto quando lo store ha uno schermo selezionato', () => {
    const open = create();
    expect(rootOf(open).querySelector('dialog')?.open).toBe(true);
    expect(rootOf(open).querySelector('.dialog__title')?.textContent).toBe('Schermo ABCD1234');
    expect(rootOf(open).textContent).toContain('Proiezione ABCD1234');
    expect(rootOf(open).textContent).toContain('visto ora');
    expect(rootOf(open).textContent).toContain('Proiezione non disponibile.');

    regia.screenDialog.set(null);
    open.detectChanges();
    expect(rootOf(open).querySelector('dialog')?.open).toBe(false);
  });

  it('zooma con la rotella e aggiorna l’etichetta', () => {
    const fixture = create();
    const wheel = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });

    viewerOf(fixture).dispatchEvent(wheel);
    fixture.detectChanges();

    expect(wheel.defaultPrevented).toBe(true);
    expect(regia.zoomBy).toHaveBeenCalledWith(1.12);
    expect(rootOf(fixture).textContent).toContain('Zoom 112%');
    expect(viewerOf(fixture).getAttribute('data-zoom')).toBe('1.12');
  });

  it('gestisce pan con pointer capture e move', () => {
    const fixture = create();
    const viewer = viewerOf(fixture);
    const capture = vi.fn();
    viewer.setPointerCapture = capture;

    const down = new Event('pointerdown', { bubbles: true, cancelable: true }) as PointerEvent;
    Object.assign(down, { pointerId: 7, clientX: 10, clientY: 20 });
    viewer.dispatchEvent(down);

    const move = new Event('pointermove', { bubbles: true, cancelable: true }) as PointerEvent;
    Object.assign(move, { pointerId: 7, clientX: 40, clientY: 60 });
    viewer.dispatchEvent(move);

    const up = new Event('pointerup', { bubbles: true, cancelable: true }) as PointerEvent;
    Object.assign(up, { pointerId: 7 });
    viewer.dispatchEvent(up);

    expect(capture).toHaveBeenCalledWith(7);
    expect(regia.startPan).toHaveBeenCalledWith(10, 20);
    expect(regia.movePan).toHaveBeenCalledWith(40, 60, expect.any(Object));
    expect(regia.endPan).toHaveBeenCalledTimes(1);
  });

  it('reimposta la vista e chiude l’anteprima', () => {
    const fixture = create();
    const reset = Array.from(rootOf(fixture).querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Reimposta vista');
    reset?.click();
    expect(regia.resetView).toHaveBeenCalledTimes(1);

    const close = Array.from(rootOf(fixture).querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Chiudi anteprima');
    close?.click();
    fixture.detectChanges();

    expect(regia.closeScreenDialog).toHaveBeenCalledTimes(1);
  });
});
