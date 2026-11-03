import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom, forkJoin } from 'rxjs';
import {
  srdCatalogSchema,
  type SrdCatalog,
  type SrdClass,
  type SrdMeta,
} from '@dnd-vtt/shared';
import { readResource } from './read-resource';
import { httpMessage } from './http-error';

export const SRD_VERSION = 'srd-5.2.0';

interface SrdMetaResponse {
  version: string;
  license: SrdMeta['license'];
  source: SrdMeta['source'];
  counts: SrdMeta['counts'];
}

interface SrdCollections {
  meta: SrdMetaResponse;
  classes: SrdClass[];
  species: SrdCatalog['species'];
  backgrounds: SrdCatalog['backgrounds'];
  feats: SrdCatalog['feats'];
  spells: SrdCatalog['spells'];
  items: SrdCatalog['items'];
  monsters: SrdCatalog['monsters'];
}

@Injectable({ providedIn: 'root' })
export class SrdCatalogService {
  private readonly http = inject(HttpClient);
  private readonly requested = signal(false);
  private loadPromise: Promise<void> | undefined;
  private pendingLoad: (() => void) | undefined;

  private readonly catalogResource = readResource<SrdCatalog, string>({
    params: () => (this.requested() ? SRD_VERSION : undefined),
    loader: () => this.fetchCatalog(),
    errorMessage: 'Impossibile caricare i cataloghi SRD',
  });

  public readonly catalog = computed<SrdCatalog | null>(
    () => this.catalogResource.value() ?? null,
  );

  public readonly loading = this.catalogResource.isLoading;

  public readonly error = computed<string | null>(() => {
    const error = this.catalogResource.error();
    return error === undefined
      ? null
      : httpMessage(error, { fallback: 'Impossibile caricare i cataloghi SRD' });
  });

  public constructor() {
    // Il loader risolve la promise prima che il resource aggiorni lo stato:
    // aspettiamo `resolved`/`error` per mantenere `await load()` coerente con
    // il valore visibile nei computed.
    effect(() => {
      if (this.catalogResource.status() === 'resolved') {
        this.settleLoad();
      } else if (this.catalogResource.status() === 'error') {
        this.settleLoad();
      }
    });
  }

  public load(): Promise<void> {
    if (this.catalog() !== null) {
      return Promise.resolve();
    }
    if (this.loadPromise !== undefined) {
      return this.loadPromise;
    }
    this.loadPromise = new Promise<void>((resolve) => {
      this.pendingLoad = resolve;
      if (this.requested()) {
        this.catalogResource.reload();
      } else {
        this.requested.set(true);
      }
    });
    return this.loadPromise;
  }

  private settleLoad(): void {
    if (this.loadPromise === undefined) {
      return;
    }
    const resolve = this.pendingLoad;
    this.pendingLoad = undefined;
    this.loadPromise = undefined;
    resolve?.();
  }

  private async fetchCatalog(): Promise<SrdCatalog> {
    const base = `/api/v1/srd/${SRD_VERSION}`;
    const collections = await firstValueFrom(forkJoin({
      meta: this.http.get<SrdMetaResponse>('/api/v1/srd/meta'),
      classes: this.http.get<SrdCatalog['classes']>(`${base}/classes`),
      species: this.http.get<SrdCatalog['species']>(`${base}/species`),
      backgrounds: this.http.get<SrdCatalog['backgrounds']>(`${base}/backgrounds`),
      feats: this.http.get<SrdCatalog['feats']>(`${base}/feats`),
      spells: this.http.get<SrdCatalog['spells']>(`${base}/spells`),
      items: this.http.get<SrdCatalog['items']>(`${base}/items`),
      monsters: this.http.get<SrdCatalog['monsters']>(`${base}/monsters`),
    } satisfies Record<keyof SrdCollections, unknown>));
    return srdCatalogSchema.parse({
      meta: {
        version: collections.meta.version,
        name: 'System Reference Document 5.2',
        license: collections.meta.license,
        source: collections.meta.source,
        counts: collections.meta.counts,
      },
      classes: collections.classes,
      species: collections.species,
      backgrounds: collections.backgrounds,
      feats: collections.feats,
      spells: collections.spells,
      items: collections.items,
      monsters: collections.monsters,
    });
  }
}
