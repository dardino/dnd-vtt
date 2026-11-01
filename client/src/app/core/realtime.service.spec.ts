import { TestBed } from '@angular/core/testing';
import type { DisplayState } from '@dnd-vtt/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DisplayPayload, PresencePayload, RealtimeAction } from './realtime.service';
import { RealtimeService } from './realtime.service';

const CAMPAIGN_ID = '0190f000-0000-7000-8000-000000000001';
const SCENE_ID = '0190f000-0000-7000-8000-000000000002';
const DISPLAY_CODE = 'ABCD-1234';

type Listener = (event: Event) => void;

class FakeSocket {
  static readonly instances: FakeSocket[] = [];

  static reset(): void {
    FakeSocket.instances.length = 0;
  }

  static at(index: number): FakeSocket {
    const socket = FakeSocket.instances[index];
    if (socket === undefined) {
      throw new Error(`socket ${index} non creato`);
    }
    return socket;
  }

  readyState = 0;
  readonly url: string;
  private readonly listeners = new Map<string, Listener[]>();

  constructor(url: string) {
    this.url = url;
    FakeSocket.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    const registered = this.listeners.get(type) ?? [];
    registered.push(listener);
    this.listeners.set(type, registered);
  }

  send(): void {
    // Il servizio non invia frame nel passo A1b.
  }

  close(): void {
    this.fail();
  }

  open(): void {
    this.readyState = 1;
    this.emit('open');
  }

  fail(code = 1006): void {
    if (this.readyState === 3) {
      return;
    }
    this.readyState = 3;
    this.emit('close', { code } as CloseEvent);
  }

  receive(data: unknown): void {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    this.emit('message', { data: payload } as MessageEvent);
  }

  private emit(type: string, event: Event = {} as Event): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

const envelope = (type: string, payload: unknown): unknown => ({
  v: 1,
  type,
  seq: 7,
  at: '2026-11-01T10:00:00.000Z',
  payload,
});

const appliedAction = (stateVersion = 4): unknown => ({
  id: '0190f000-0000-7000-8000-000000000003',
  sceneId: SCENE_ID,
  type: 'initiative.next',
  label: 'Iniziativa avanzata',
  stateVersion,
  action: { type: 'initiative.next' },
  inverse: { type: 'initiative.next' },
  at: '2026-11-01T10:00:01.000Z',
});

const displayState = (): DisplayState => ({
  campaign: { id: CAMPAIGN_ID, name: 'Realtime' },
  compositionVersion: 1,
  program: {
    hud: { dice: false, initiative: false, pointer: false },
    blackout: false,
    background: '#000000',
    updatedAt: '2026-11-01T10:00:00.000Z',
  },
  composition: {
    base: { id: 'base', frame: { x: 0, y: 0, width: 1, height: 1 }, opacity: 1, type: 'blank' },
    overlays: [],
  },
  rolls: [],
});

describe('RealtimeService', () => {
  let service: RealtimeService;

  beforeEach(() => {
    FakeSocket.reset();
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeSocket);
    TestBed.configureTestingModule({});
    service = TestBed.inject(RealtimeService);
  });

  afterEach(() => {
    service.disconnect();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('apre una connessione DM verso /ws e aggiorna lo stato', () => {
    service.connectDm(CAMPAIGN_ID);

    expect(service.status()).toBe('connecting');
    expect(FakeSocket.instances).toHaveLength(1);
    const socket = FakeSocket.at(0);
    const url = new URL(socket.url);
    expect(url.protocol).toBe('ws:');
    expect(url.pathname).toBe('/ws');
    expect(url.searchParams.get('role')).toBe('dm');
    expect(url.searchParams.get('campaignId')).toBe(CAMPAIGN_ID);

    socket.open();
    expect(service.status()).toBe('open');
  });

  it('apre la connessione display con il codice e riceve hello', () => {
    const received: DisplayPayload[] = [];
    service.display$.subscribe((payload) => {
      received.push(payload);
    });

    service.connectDisplay(DISPLAY_CODE);
    const socket = FakeSocket.at(0);
    const url = new URL(socket.url);
    expect(url.searchParams.get('role')).toBe('display');
    expect(url.searchParams.get('code')).toBe(DISPLAY_CODE);

    socket.open();
    socket.receive(envelope('hello', { role: 'display', display: { id: 'd1' }, state: displayState() }));
    expect(received).toHaveLength(1);
    expect(received[0]?.state.campaign.name).toBe('Realtime');
  });

  it('smista action.applied, presence.updated e display.updated', () => {
    const actions: RealtimeAction[] = [];
    const presence: PresencePayload[] = [];
    const display: DisplayPayload[] = [];
    service.actions$.subscribe((payload) => {
      actions.push(payload);
    });
    service.presence$.subscribe((payload) => {
      presence.push(payload);
    });
    service.display$.subscribe((payload) => {
      display.push(payload);
    });

    service.connectDm(CAMPAIGN_ID);
    const socket = FakeSocket.at(0);
    socket.open();

    socket.receive(envelope('action.applied', appliedAction(4)));
    socket.receive(envelope('presence.updated', { displays: 2 }));
    socket.receive(envelope('display.updated', { state: displayState() }));
    socket.receive(envelope('hello', { role: 'dm', campaignId: CAMPAIGN_ID, displays: 3 }));

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ sceneId: SCENE_ID, stateVersion: 4 });
    expect(presence).toEqual([{ displays: 2 }, { displays: 3 }]);
    expect(display).toHaveLength(1);
    expect(display[0]?.state.campaign.id).toBe(CAMPAIGN_ID);
  });

  it('scarta payload non conformi agli schemi shared', () => {
    const actions: RealtimeAction[] = [];
    const display: DisplayPayload[] = [];
    service.actions$.subscribe((payload) => {
      actions.push(payload);
    });
    service.display$.subscribe((payload) => {
      display.push(payload);
    });

    service.connectDm(CAMPAIGN_ID);
    const socket = FakeSocket.at(0);
    socket.open();

    // Azione applicata incompleta: `id` presente ma senza `action`/`inverse`.
    socket.receive(envelope('action.applied', {
      id: '0190f000-0000-7000-8000-000000000003',
      sceneId: SCENE_ID,
      type: 'initiative.next',
      label: 'Iniziativa avanzata',
      stateVersion: 4,
      at: '2026-11-01T10:00:01.000Z',
    }));
    // Revisione incompleta: manca `stateVersion`.
    socket.receive(envelope('action.applied', { sceneId: SCENE_ID }));
    // Display state incompleto.
    socket.receive(envelope('display.updated', { state: { campaign: { id: CAMPAIGN_ID, name: 'x' } } }));

    expect(actions).toHaveLength(0);
    expect(display).toHaveLength(0);
  });

  it('ignora JSON malformato ed envelope non validi', () => {
    const actions: RealtimeAction[] = [];
    const presence: PresencePayload[] = [];
    service.actions$.subscribe((payload) => {
      actions.push(payload);
    });
    service.presence$.subscribe((payload) => {
      presence.push(payload);
    });

    service.connectDm(CAMPAIGN_ID);
    const socket = FakeSocket.at(0);
    socket.open();

    socket.receive('non-json');
    socket.receive({ v: 2, type: 'action.applied', seq: 1, at: 'x', payload: { sceneId: SCENE_ID, stateVersion: 1 } });
    socket.receive({ type: 'action.applied', payload: { sceneId: SCENE_ID, stateVersion: 1 } });
    socket.receive(envelope('action.applied', { stateVersion: 1 }));
    socket.receive(envelope('presence.updated', { displays: '2' }));
    // `1e999` diventa Infinity dopo JSON.parse: il seq non finito va scartato.
    socket.receive(
      '{"v":1,"type":"action.applied","seq":1e999,"at":"2026-11-01T10:00:00.000Z",'
      + `"payload":${JSON.stringify(appliedAction())}}`,
    );

    expect(actions).toHaveLength(0);
    expect(presence).toHaveLength(0);
  });

  it('riconnette con backoff esponenziale e resetta al ritorno online', async () => {
    service.connectDm(CAMPAIGN_ID);
    FakeSocket.at(0).open();
    FakeSocket.at(0).fail();

    expect(service.status()).toBe('reconnecting');
    expect(FakeSocket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(FakeSocket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeSocket.instances).toHaveLength(2);

    // Senza riapertura il ritardo raddoppia (2 s).
    FakeSocket.at(1).fail();
    await vi.advanceTimersByTimeAsync(1_999);
    expect(FakeSocket.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeSocket.instances).toHaveLength(3);

    // L'open azzera il backoff: la chiusura successiva riparte da 1 s.
    FakeSocket.at(2).open();
    expect(service.status()).toBe('open');
    FakeSocket.at(2).fail();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(FakeSocket.instances).toHaveLength(4);
  });

  it('non apre connessioni duplicate sullo stesso target', async () => {
    service.connectDm(CAMPAIGN_ID);
    service.connectDm(CAMPAIGN_ID);
    expect(FakeSocket.instances).toHaveLength(1);

    FakeSocket.at(0).open();
    service.connectDm(CAMPAIGN_ID);
    expect(FakeSocket.instances).toHaveLength(1);

    FakeSocket.at(0).fail();
    service.connectDm(CAMPAIGN_ID);
    expect(FakeSocket.instances).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(FakeSocket.instances).toHaveLength(2);
    service.connectDm(CAMPAIGN_ID);
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it('sostituisce il socket quando cambia target senza riconnettere il vecchio', async () => {
    service.connectDm(CAMPAIGN_ID);
    const dmSocket = FakeSocket.at(0);
    dmSocket.open();

    service.connectDisplay(DISPLAY_CODE);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(dmSocket.readyState).toBe(3);
    expect(service.status()).toBe('connecting');

    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it('non riconnette quando il server revoca l’accesso (4401/4403)', async () => {
    service.connectDm(CAMPAIGN_ID);
    FakeSocket.at(0).open();
    FakeSocket.at(0).fail(4401);
    expect(service.status()).toBe('closed');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.instances).toHaveLength(1);

    service.connectDm(CAMPAIGN_ID);
    const socket = FakeSocket.at(1);
    socket.open();
    socket.fail(4403);
    expect(service.status()).toBe('closed');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it('disconnect chiude il socket e annulla la riconnessione', async () => {
    service.connectDm(CAMPAIGN_ID);
    const socket = FakeSocket.at(0);
    socket.open();

    service.disconnect();
    expect(service.status()).toBe('closed');
    expect(socket.readyState).toBe(3);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });
});
