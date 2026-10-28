import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, inject } from '@angular/core';
import type { ActionLogEntry, ActionRequest, AppliedAction, GameAction } from '@dnd-vtt/shared';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { SceneStore } from './scene.store';

export type ActionSyncStatus = 'synced' | 'pending' | 'offline' | 'read-only';

interface ActionStoreState {
  clientId: string;
  status: ActionSyncStatus;
  pending: number;
  error: string | null;
  lastSyncedAt: string | null;
  history: ActionLogEntry[];
}

const initialState: ActionStoreState = {
  clientId: '',
  status: 'synced',
  pending: 0,
  error: null,
  lastSyncedAt: null,
  history: [],
};

const newClientId = (): string =>
  typeof crypto === 'undefined' ? `client-${Date.now()}` : crypto.randomUUID();

/**
 * Invia le azioni di scena, applica l'aggiornamento ottimistico e si
 * riallinea con il log del server. Il polling è il ponte fra console diverse
 * finché la Fase 7 non introduce il WebSocket.
 */
export const ActionStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => {
    const http = inject(HttpClient);
    const scene = inject(SceneStore);
    const destroyRef = inject(DestroyRef);
    const seen = new Set<string>();
    let timer: ReturnType<typeof setInterval> | null = null;
    let channel: BroadcastChannel | null = null;
    let activeCampaign: string | null = null;
    let activeScene: string | null = null;

    const ensureClientId = (): string => {
      if (store.clientId() === '') {
        patchState(store, { clientId: newClientId() });
      }
      return store.clientId();
    };

    const ensureChannel = (): BroadcastChannel | null => {
      if (typeof BroadcastChannel === 'undefined') {
        return null;
      }
      if (channel === null) {
        channel = new BroadcastChannel('dnd-vtt-scene');
        channel.addEventListener('message', (event: MessageEvent<unknown>) => {
          const data = event.data;
          if (
            typeof data === 'object' && data !== null
            && 'campaignId' in data && 'sceneId' in data
            && data.campaignId === activeCampaign && data.sceneId === activeScene
          ) {
            void syncNow();
          }
        });
      }
      return channel;
    };

    const broadcast = (): void => {
      if (activeCampaign === null || activeScene === null) {
        return;
      }
      ensureChannel()?.postMessage({ campaignId: activeCampaign, sceneId: activeScene });
    };

    const settlePending = (): void => {
      const pending = Math.max(0, store.pending() - 1);
      patchState(store, {
        pending,
        status: pending > 0 ? 'pending' : 'synced',
      });
    };

    const refreshHistory = async (campaignId: string): Promise<void> => {
      try {
        const history = await firstValueFrom(
          http.get<{ items: ActionLogEntry[] }>(`/api/v1/campaigns/${campaignId}/actions`),
        );
        patchState(store, { history: history.items });
      } catch {
        // La history è accessoria: lo stato di sincronizzazione resta quello reale.
      }
    };

    const syncNow = async (): Promise<void> => {
      if (activeCampaign === null || activeScene === null) {
        return;
      }
      const snapshot = scene.snapshot();
      if (snapshot === null || snapshot.scene.id !== activeScene) {
        return;
      }
      const campaignId = activeCampaign;
      try {
        const response = await firstValueFrom(
          http.get<{ items: ActionLogEntry[] }>(
            `/api/v1/campaigns/${campaignId}/actions`
            + `?sinceVersion=${scene.stateVersion()}&sceneId=${activeScene}`,
          ),
        );
        for (const entry of response.items) {
          if (entry.sceneId !== activeScene || entry.stateVersion <= scene.stateVersion()) {
            continue;
          }
          if (entry.stateVersion > scene.stateVersion() + 1) {
            await scene.load(activeScene);
            break;
          }
          if (seen.has(entry.id)) {
            scene.ackVersion(entry.stateVersion);
            continue;
          }
          try {
            scene.applyServerAction(toAppliedAction(entry));
          } catch {
            await scene.load(activeScene);
            break;
          }
        }
        patchState(store, {
          status: store.pending() > 0 ? 'pending' : 'synced',
          error: null,
          lastSyncedAt: new Date().toISOString(),
        });
        if (response.items.length > 0) {
          await refreshHistory(campaignId);
        }
      } catch (error) {
        patchState(store, {
          status: 'offline',
          error: messageFor(error),
        });
      }
    };

    const stop = (): void => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      activeCampaign = null;
      activeScene = null;
      channel?.close();
      channel = null;
    };

    destroyRef.onDestroy(stop);

    return {
      /** Avvia il riallineamento periodico per la scena attiva. */
      watch(campaignId: string, sceneId: string): void {
        stop();
        activeCampaign = campaignId;
        activeScene = sceneId;
        patchState(store, { status: 'synced', error: null });
        timer = setInterval(() => {
          void syncNow();
        }, 2000);
        void refreshHistory(campaignId);
      },

      stop,

      async send(sceneId: string, action: GameAction): Promise<AppliedAction | null> {
        const campaignId = activeCampaign;
        if (campaignId === null) {
          return null;
        }
        const id = crypto.randomUUID();
        seen.add(id);
        try {
          scene.applyOptimistic(action);
        } catch (error) {
          seen.delete(id);
          patchState(store, { error: messageFor(error) });
          return null;
        }
        patchState(store, { pending: store.pending() + 1, status: 'pending' });
        const request: ActionRequest = {
          id,
          clientId: ensureClientId(),
          sceneId,
          action,
        };
        try {
          const applied = await firstValueFrom(
            http.post<AppliedAction>(`/api/v1/campaigns/${campaignId}/actions`, request),
          );
          scene.ackVersion(applied.stateVersion);
          settlePending();
          patchState(store, { lastSyncedAt: new Date().toISOString(), error: null });
          broadcast();
          void refreshHistory(campaignId);
          return applied;
        } catch (error) {
          seen.delete(id);
          settlePending();
          patchState(store, {
            status: error instanceof HttpErrorResponse && error.status === 403
              ? 'read-only'
              : error instanceof HttpErrorResponse && error.status === 0 ? 'offline' : 'synced',
            error: messageFor(error),
          });
          await scene.load(sceneId);
          return null;
        }
      },

      syncNow,

      refreshHistory,
    };
  }),
);

const toAppliedAction = (entry: ActionLogEntry): AppliedAction => ({
  id: entry.id,
  sceneId: entry.sceneId ?? '',
  type: entry.type,
  label: entry.label,
  stateVersion: entry.stateVersion,
  action: entry.payload,
  inverse: entry.inverse,
  at: entry.createdAt,
});

const messageFor = (error: unknown): string => {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return 'Server non raggiungibile: le modifiche restano locali finché non torna la connessione.';
    }
    if (error.status === 403) {
      return 'La console è in sola lettura.';
    }
    if (error.status === 409) {
      return 'La scena è cambiata altrove: stato riallineato.';
    }
  }
  return 'Azione non applicata. Stato riallineato dal server.';
};
