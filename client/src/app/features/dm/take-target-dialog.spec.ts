import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type { Display } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScreenSummary } from './regia-summary';
import { TakeTargetDialog } from './take-target-dialog';

const CAMPAIGN_ID = '0190f000-0000-7000-8000-000000000001';
const DISPLAY_ID = '0190f000-0000-7000-8000-000000000002';
const OTHER_ID = '0190f000-0000-7000-8000-000000000003';

const summary = (overrides: Partial<Display> = {}): ScreenSummary => ({
  display: {
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
    ...overrides,
  },
  state: null,
});

describe('TakeTargetDialog', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.open = false;
    });
    TestBed.configureTestingModule({ imports: [TakeTargetDialog] });
  });

  const create = (options: {
    open?: boolean;
    screens?: readonly ScreenSummary[];
  } = {}): ComponentFixture<TakeTargetDialog> => {
    const fixture = TestBed.createComponent(TakeTargetDialog);
    fixture.componentRef.setInput('open', options.open ?? true);
    fixture.componentRef.setInput('screens', options.screens ?? [summary()]);
    fixture.componentRef.setInput('projectionLabel', (item: ScreenSummary) => `Proiezione ${item.display.code}`);
    fixture.detectChanges();
    return fixture;
  };

  const rootOf = (fixture: ComponentFixture<TakeTargetDialog>): HTMLElement =>
    fixture.nativeElement as HTMLElement;

  it('apre e chiude il dialog in base a open', () => {
    expect(rootOf(create()).querySelector('dialog')?.open).toBe(true);
    expect(rootOf(create({ open: false })).querySelector('dialog')?.open).toBe(false);
  });

  it('mostra testo e lista schermi con codice, badge e proiezione', () => {
    const fixture = create({
      screens: [summary(), summary({ id: OTHER_ID, code: 'WXYZ9876', label: 'Secondo schermo' })],
    });
    const root = rootOf(fixture);
    const rows = root.querySelectorAll('.screen-row');

    expect(root.querySelector('.dialog__title')?.textContent).toBe('Manda in onda su…');
    expect(root.textContent).toContain('Scegli lo schermo che deve ricevere la scena attiva.');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.querySelector('.screen-row__head strong')?.textContent).toBe('ABCD1234');
    expect(rows[0]?.querySelector('.badge')?.textContent).toBe('Schermo giocatori');
    expect(rows[0]?.querySelector('.muted')?.textContent).toBe('Proiezione ABCD1234');
    expect(rows[1]?.querySelector('.badge')?.textContent).toBe('Secondo schermo');
  });

  it('emette lo schermo scelto', () => {
    const items = [summary(), summary({ id: OTHER_ID, code: 'WXYZ9876' })];
    const fixture = create({ screens: items });
    const emitted = vi.fn<(value: ScreenSummary) => void>();
    fixture.componentInstance.take.subscribe(emitted);

    const rows = rootOf(fixture).querySelectorAll('.screen-row');
    (rows[1] as HTMLButtonElement).click();

    expect(emitted).toHaveBeenCalledTimes(1);
    expect(emitted.mock.calls[0]?.[0]?.display.id).toBe(OTHER_ID);
  });

  it('emette dismiss dal pulsante Annulla e dalla chiusura del dialog', () => {
    const fixture = create();
    const dismissed = vi.fn();
    fixture.componentInstance.dismiss.subscribe(dismissed);

    const cancel = Array.from(rootOf(fixture).querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Annulla');
    cancel?.click();
    (rootOf(fixture).querySelector('.dialog__close') as HTMLButtonElement).click();

    expect(dismissed).toHaveBeenCalledTimes(2);
  });
});
