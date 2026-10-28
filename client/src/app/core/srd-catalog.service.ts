import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom, forkJoin } from 'rxjs';
import {
  srdCatalogSchema,
  type SrdCatalog,
  type SrdClass,
  type SrdMeta,
} from '@dnd-vtt/shared';

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
  private loadPromise: Promise<void> | undefined;

  public readonly catalog = signal<SrdCatalog | null>(null);
  public readonly loading = signal(false);
  public readonly error = signal<string | null>(null);

  public load(): Promise<void> {
    if (this.catalog() !== null) {
      return Promise.resolve();
    }
    this.loadPromise ??= this.fetchCatalog();
    return this.loadPromise;
  }

  private async fetchCatalog(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    const base = `/api/v1/srd/${SRD_VERSION}`;
    try {
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
      this.catalog.set(srdCatalogSchema.parse({
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
      }));
    } catch (error) {
      this.loadPromise = undefined;
      this.error.set(error instanceof Error ? error.message : 'Impossibile caricare i cataloghi SRD');
    } finally {
      this.loading.set(false);
    }
  }
}
