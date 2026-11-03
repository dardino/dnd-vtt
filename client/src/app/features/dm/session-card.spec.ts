import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import type { Session } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionCard } from './session-card';

const CAMPAIGN_ID = '0190f000-0000-7000-8000-000000000001';
const SESSION_ID = '0190f000-0000-7000-8000-000000000002';

const session = (overrides: Partial<Session> = {}): Session => ({
  id: SESSION_ID,
  campaignId: CAMPAIGN_ID,
  number: 3,
  startedAt: '2026-11-03T10:00:00.000Z',
  endedAt: null,
  durationSeconds: null,
  notes: null,
  ...overrides,
});

describe('SessionCard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SessionCard] });
  });

  const create = (
    value: Session | null,
    label = '00:12:34',
    busy = false,
  ): ComponentFixture<SessionCard> => {
    const fixture = TestBed.createComponent(SessionCard);
    fixture.componentRef.setInput('session', value);
    fixture.componentRef.setInput('label', label);
    fixture.componentRef.setInput('busy', busy);
    fixture.detectChanges();
    return fixture;
  };

  it('senza sessione mostra il pulsante di avvio e nessun timer', () => {
    const fixture = create(null);
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('.session-card')).not.toBeNull();
    expect(root.querySelector('.session-card')?.textContent).toContain('Sessione');
    expect(root.querySelector('.session-card__timer')).toBeNull();
    expect(root.querySelector('button')?.textContent).toContain('Avvia sessione');
  });

  it('emette start al click su "Avvia sessione"', () => {
    const fixture = create(null);
    const emitted = vi.fn<() => void>();
    fixture.componentInstance.start.subscribe(emitted);

    (fixture.nativeElement as HTMLElement).querySelector('button')?.click();

    expect(emitted).toHaveBeenCalledTimes(1);
  });

  it('con sessione in corso mostra numero, timer e "Termina"', () => {
    const fixture = create(session(), '01:02:03');
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('.eyebrow')?.textContent).toContain('Sessione 3 in corso');
    expect(root.querySelector('.session-card__timer')?.textContent).toBe('01:02:03');
    expect(root.querySelector('button')?.textContent).toContain('Termina');
  });

  it('emette stop al click su "Termina" senza emettere start', () => {
    const fixture = create(session());
    const started = vi.fn<() => void>();
    const stopped = vi.fn<() => void>();
    fixture.componentInstance.start.subscribe(started);
    fixture.componentInstance.stop.subscribe(stopped);

    (fixture.nativeElement as HTMLElement).querySelector('button')?.click();

    expect(stopped).toHaveBeenCalledTimes(1);
    expect(started).not.toHaveBeenCalled();
  });

  it('disabilita il pulsante quando busy', () => {
    const running = create(session(), '00:00:01', true);
    const idle = create(null, '00:00:00', true);

    expect((running.nativeElement as HTMLElement).querySelector('button')?.disabled).toBe(true);
    expect((idle.nativeElement as HTMLElement).querySelector('button')?.disabled).toBe(true);
  });
});
