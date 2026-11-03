import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import type { Display } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScreenSummary } from './regia-summary';
import { ScreenList } from './screen-list';

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

describe('ScreenList', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ScreenList] });
  });

  const create = (screens: readonly ScreenSummary[]): ComponentFixture<ScreenList> => {
    const fixture = TestBed.createComponent(ScreenList);
    fixture.componentRef.setInput('screens', screens);
    fixture.componentRef.setInput('projectionLabel', (item: ScreenSummary) => `Proiezione ${item.display.code}`);
    fixture.componentRef.setInput('lastSeen', (item: ScreenSummary) => `ultima ${item.display.code}`);
    fixture.detectChanges();
    return fixture;
  };

  it('mostra il messaggio di vuoto senza la lista', () => {
    const fixture = create([]);
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('.screen-list')).toBeNull();
    expect(root.querySelector('p.muted')?.textContent).toContain('Nessuno schermo online');
  });

  it('mostra codice, badge, proiezione, viewport e ultima attività', () => {
    const fixture = create([
      summary(),
      summary({ id: OTHER_ID, code: 'WXYZ9876', label: 'Secondo schermo' }),
    ]);
    const root = fixture.nativeElement as HTMLElement;
    const rows = root.querySelectorAll('.screen-row');

    expect(rows).toHaveLength(2);
    expect(rows[0]?.querySelector('.screen-row__head strong')?.textContent).toBe('ABCD1234');
    expect(rows[0]?.querySelector('.badge')?.textContent).toBe('Schermo giocatori');
    expect(rows[0]?.querySelector('.screen-row__projection')?.textContent).toBe('Proiezione ABCD1234');
    expect(rows[0]?.querySelector('.muted')?.textContent).toContain('1920 × 1080');
    expect(rows[0]?.querySelector('.muted')?.textContent).toContain('ultima ABCD1234');
    expect(rows[1]?.querySelector('.badge')?.textContent).toBe('Secondo schermo');
  });

  it('mostra un trattino quando la viewport non è nota', () => {
    const fixture = create([summary({ viewportWidth: null, viewportHeight: null })]);
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('.muted')?.textContent).toContain('— × —');
  });

  it('emette lo schermo selezionato all\'apertura', () => {
    const items = [summary(), summary({ id: OTHER_ID, code: 'WXYZ9876' })];
    const fixture = create(items);
    const emitted = vi.fn<(value: ScreenSummary) => void>();
    fixture.componentInstance.selectScreen.subscribe(emitted);

    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('.screen-row');
    (rows[1] as HTMLButtonElement).click();

    expect(emitted).toHaveBeenCalledTimes(1);
    expect(emitted.mock.calls[0]?.[0]?.display.id).toBe(OTHER_ID);
  });
});
