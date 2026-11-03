import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { Session } from '@dnd-vtt/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActorService } from '../../core/actor.service';
import { AssetService } from '../../core/asset.service';
import { CampaignService } from '../../core/campaign.service';
import { CampaignShellStore } from './campaign-shell.store';
import { DmSessionStore } from './dm-session.store';
import { DmUiStore } from './dm-ui.store';

const CAMPAIGN_ID = '0190f000-0000-7000-8000-000000000001';

const session = (endedAt: string | null = null): Session => ({
  id: '0190f000-0000-7000-8000-000000000010',
  campaignId: CAMPAIGN_ID,
  number: 4,
  startedAt: '2026-11-01T10:00:00.000Z',
  endedAt,
  durationSeconds: endedAt === null ? null : 120,
  notes: null,
});

interface CampaignApiFake {
  list: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  listScenes: ReturnType<typeof vi.fn>;
  listSessions: ReturnType<typeof vi.fn>;
  startSession: ReturnType<typeof vi.fn>;
  stopSession: ReturnType<typeof vi.fn>;
}

describe('DmSessionStore', () => {
  let store: InstanceType<typeof DmSessionStore>;
  let ui: InstanceType<typeof DmUiStore>;
  let shell: InstanceType<typeof CampaignShellStore>;
  let campaignsApi: CampaignApiFake;

  beforeEach(() => {
    campaignsApi = {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn(),
      listScenes: vi.fn().mockResolvedValue([]),
      listSessions: vi.fn().mockResolvedValue([]),
      startSession: vi.fn().mockResolvedValue(session()),
      stopSession: vi.fn().mockResolvedValue(session('2026-11-01T10:02:00.000Z')),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: CampaignService, useValue: campaignsApi },
        { provide: ActorService, useValue: { listByCampaign: vi.fn().mockResolvedValue([]) } },
        { provide: AssetService, useValue: { get: vi.fn() } },
      ],
    });
    shell = TestBed.inject(CampaignShellStore);
    ui = TestBed.inject(DmUiStore);
    store = TestBed.inject(DmSessionStore);
  });

  afterEach(() => {
    store.stopTimer();
    vi.useRealTimers();
  });

  it('parte da zero e senza busy', () => {
    expect(store.sessionSeconds()).toBe(0);
    expect(store.sessionBusy()).toBe(false);
    expect(store.sessionLabel()).toBe('00:00:00');
  });

  it('allinea i secondi alla sessione attiva e avanza ogni secondo', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T10:00:10.000Z'));

    store.sync(session());

    expect(store.sessionSeconds()).toBe(10);
    expect(store.sessionLabel()).toBe('00:00:10');

    vi.advanceTimersByTime(2000);
    expect(store.sessionSeconds()).toBe(12);
    expect(store.sessionLabel()).toBe('00:00:12');
  });

  it('azzera e ferma il timer quando non c\'è una sessione attiva', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T10:00:05.000Z'));

    store.sync(session());
    expect(store.sessionSeconds()).toBe(5);

    store.sync(null);
    expect(store.sessionSeconds()).toBe(0);

    vi.advanceTimersByTime(3000);
    expect(store.sessionSeconds()).toBe(0);
  });

  it('start avvia il timer e aggiorna lo status message', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T10:00:00.000Z'));

    await store.start(CAMPAIGN_ID);

    expect(campaignsApi.startSession).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(store.sessionBusy()).toBe(false);
    expect(store.sessionSeconds()).toBe(0);
    expect(ui.statusMessage()).toBe('Sessione 4 avviata');

    vi.advanceTimersByTime(1000);
    expect(store.sessionSeconds()).toBe(1);
  });

  it('stop ferma il timer e aggiorna lo status message', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T10:00:00.000Z'));

    await store.start(CAMPAIGN_ID);
    vi.advanceTimersByTime(2000);
    expect(store.sessionSeconds()).toBe(2);

    await store.stop(CAMPAIGN_ID);

    expect(campaignsApi.stopSession).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(shell.activeSession()).toBeNull();
    expect(store.sessionBusy()).toBe(false);
    expect(ui.statusMessage()).toBe('Sessione 4 terminata');

    vi.advanceTimersByTime(3000);
    expect(store.sessionSeconds()).toBe(2);
  });

  it('ignora start e stop mentre una richiesta è in corso', async () => {
    let resolveStart: ((value: Session) => void) | undefined;
    campaignsApi.startSession.mockReturnValue(new Promise<Session>((resolve) => {
      resolveStart = resolve;
    }));

    const first = store.start(CAMPAIGN_ID);
    expect(store.sessionBusy()).toBe(true);
    await store.start(CAMPAIGN_ID);
    expect(campaignsApi.startSession).toHaveBeenCalledTimes(1);

    resolveStart?.(session());
    await first;
    expect(store.sessionBusy()).toBe(false);
  });

  it('in errore imposta notice e rilascia il busy', async () => {
    campaignsApi.startSession.mockRejectedValue(
      new HttpErrorResponse({ status: 404 }),
    );

    await store.start(CAMPAIGN_ID);

    expect(ui.notice()).toBe('La campagna non esiste più.');
    expect(store.sessionBusy()).toBe(false);
    expect(store.sessionSeconds()).toBe(0);

    campaignsApi.stopSession.mockRejectedValue(
      new HttpErrorResponse({ status: 401 }),
    );
    await store.stop(CAMPAIGN_ID);

    expect(ui.notice()).toBe('Sessione scaduta: autentica di nuovo.');
    expect(store.sessionBusy()).toBe(false);
  });
});
