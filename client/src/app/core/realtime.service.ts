import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import {
  appliedActionSchema,
  displayStateSchema,
  type AppliedAction,
  type DisplayState,
} from '@dnd-vtt/shared';
import { Subject, type Observable } from 'rxjs';

export type RealtimeStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

/** Revisione senza azione: undo, redo e reset-fog notificano solo la nuova versione. */
export interface ActionRevision {
  sceneId: string;
  stateVersion: number;
}

export type RealtimeAction = AppliedAction | ActionRevision;

export interface PresencePayload {
  displays: number;
}

export interface DisplayPayload {
  state: DisplayState;
}

export interface RealtimeEnvelope {
  v: number;
  type: string;
  seq: number;
  at: string;
  payload: unknown;
}

type RealtimeTarget = { role: 'dm'; campaignId: string } | { role: 'display'; code: string };

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parseEnvelope = (data: unknown): RealtimeEnvelope | null => {
  if (typeof data !== 'string') {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }
  const { v, type, seq, at, payload } = parsed;
  if (
    v !== 1
    || typeof type !== 'string'
    || typeof seq !== 'number'
    || !Number.isFinite(seq)
    || typeof at !== 'string'
  ) {
    return null;
  }
  return { v, type, seq, at, payload };
};

const revisionOf = (payload: Record<string, unknown>): ActionRevision | null => {
  const sceneId = payload['sceneId'];
  const stateVersion = payload['stateVersion'];
  if (typeof sceneId !== 'string' || sceneId === '') {
    return null;
  }
  if (typeof stateVersion !== 'number' || !Number.isInteger(stateVersion) || stateVersion < 1) {
    return null;
  }
  return { sceneId, stateVersion };
};

const actionOf = (payload: unknown): RealtimeAction | null => {
  const applied = appliedActionSchema.safeParse(payload);
  if (applied.success) {
    return applied.data;
  }
  // Undo, redo e reset-fog notificano solo la revisione: niente `id`/`action`.
  if (!isRecord(payload) || 'id' in payload || 'action' in payload) {
    return null;
  }
  return revisionOf(payload);
};

const presenceOf = (payload: unknown): PresencePayload | null => {
  if (!isRecord(payload)) {
    return null;
  }
  const displays = payload['displays'];
  if (typeof displays !== 'number' || !Number.isInteger(displays) || displays < 0) {
    return null;
  }
  return { displays };
};

const displayOf = (payload: unknown): DisplayPayload | null => {
  if (!isRecord(payload)) {
    return null;
  }
  const state = displayStateSchema.safeParse(payload['state']);
  return state.success ? { state: state.data } : null;
};

const sameTarget = (left: RealtimeTarget, right: RealtimeTarget): boolean => {
  if (left.role === 'dm' && right.role === 'dm') {
    return left.campaignId === right.campaignId;
  }
  if (left.role === 'display' && right.role === 'display') {
    return left.code === right.code;
  }
  return false;
};

const urlFor = (target: RealtimeTarget): string => {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const query = target.role === 'dm'
    ? `role=dm&campaignId=${encodeURIComponent(target.campaignId)}`
    : `role=display&code=${encodeURIComponent(target.code)}`;
  return `${scheme}//${location.host}/ws?${query}`;
};

/**
 * Unica connessione WebSocket del client: incapsula URL, envelope, riconnessione
 * con backoff esponenziale e smistamento dei messaggi ai Subject osservabili.
 * Una sola connessione per istanza: richieste ripetute sullo stesso target non
 * aprono socket aggiuntivi.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  readonly status = signal<RealtimeStatus>('idle');
  readonly actions$: Observable<RealtimeAction>;
  readonly presence$: Observable<PresencePayload>;
  readonly display$: Observable<DisplayPayload>;

  private readonly actionsSubject = new Subject<RealtimeAction>();
  private readonly presenceSubject = new Subject<PresencePayload>();
  private readonly displaySubject = new Subject<DisplayPayload>();
  private readonly destroyRef = inject(DestroyRef);
  private target: RealtimeTarget | null = null;
  private socket: WebSocket | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = INITIAL_BACKOFF_MS;

  constructor() {
    this.actions$ = this.actionsSubject.asObservable();
    this.presence$ = this.presenceSubject.asObservable();
    this.display$ = this.displaySubject.asObservable();
    this.destroyRef.onDestroy(() => {
      this.disconnect();
    });
  }

  connectDm(campaignId: string): void {
    this.connect({ role: 'dm', campaignId });
  }

  connectDisplay(code: string): void {
    this.connect({ role: 'display', code });
  }

  disconnect(): void {
    this.target = null;
    this.clearRetry();
    this.releaseSocket();
    this.backoffMs = INITIAL_BACKOFF_MS;
    this.status.set('closed');
  }

  private connect(target: RealtimeTarget): void {
    if (this.target !== null && sameTarget(this.target, target)) {
      // Socket già aperto/in apertura oppure riconnessione già pianificata.
      if (this.socket !== null || this.retryTimer !== null) {
        return;
      }
    } else {
      this.clearRetry();
      this.releaseSocket();
      this.target = target;
      this.backoffMs = INITIAL_BACKOFF_MS;
    }
    this.startSocket(false);
  }

  private startSocket(reconnecting: boolean): void {
    const target = this.target;
    if (target === null) {
      return;
    }
    this.status.set(reconnecting ? 'reconnecting' : 'connecting');
    const socket = new WebSocket(urlFor(target));
    this.socket = socket;
    socket.addEventListener('open', () => {
      if (this.socket !== socket) {
        return;
      }
      this.backoffMs = INITIAL_BACKOFF_MS;
      this.status.set('open');
    });
    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) {
        return;
      }
      this.handleMessage(event.data);
    });
    socket.addEventListener('close', (event) => {
      if (this.socket !== socket) {
        return;
      }
      this.socket = null;
      // 4401/4403: credenziali o display revocati, la riconnessione non può riuscire.
      if (event.code === 4401 || event.code === 4403) {
        this.disconnect();
        return;
      }
      this.scheduleRetry();
    });
  }

  private handleMessage(data: unknown): void {
    const envelope = parseEnvelope(data);
    if (envelope === null) {
      return;
    }
    switch (envelope.type) {
      case 'action.applied': {
        const action = actionOf(envelope.payload);
        if (action !== null) {
          this.actionsSubject.next(action);
        }
        return;
      }
      case 'presence.updated': {
        const presence = presenceOf(envelope.payload);
        if (presence !== null) {
          this.presenceSubject.next(presence);
        }
        return;
      }
      case 'display.updated': {
        const display = displayOf(envelope.payload);
        if (display !== null) {
          this.displaySubject.next(display);
        }
        return;
      }
      case 'hello': {
        this.handleHello(envelope.payload);
        return;
      }
      default:
        return;
    }
  }

  /** `hello` porta lo stato iniziale: stessa forma dei rispettivi eventi di aggiornamento. */
  private handleHello(payload: unknown): void {
    const role = this.target?.role;
    if (role === 'dm') {
      const presence = presenceOf(payload);
      if (presence !== null) {
        this.presenceSubject.next(presence);
      }
    } else if (role === 'display') {
      const display = displayOf(payload);
      if (display !== null) {
        this.displaySubject.next(display);
      }
    }
  }

  private scheduleRetry(): void {
    if (this.target === null) {
      return;
    }
    this.status.set('reconnecting');
    const delay = this.backoffMs;
    this.backoffMs = Math.min(MAX_BACKOFF_MS, delay * 2);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.startSocket(true);
    }, delay);
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private releaseSocket(): void {
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }
}
