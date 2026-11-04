import { signal, type WritableSignal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  emptyMapDocument,
  type BlockedArea,
  type Map,
  type MapDocument,
  type MapElement,
  type MapLayerKind,
  type MapLayers,
  type SrdItem,
  type WallSegment,
} from '@dnd-vtt/shared';
import { MapLootDialogComponent } from './map-loot-dialog.component';
import type { MapEditorPage } from './map-editor.page';

export const MAP_ID = 'map-loot';

export type LootElement = MapElement & { type: 'loot' };

export const loot = (
  id: string,
  overrides: Partial<Omit<LootElement, 'id' | 'type'>> = {},
): LootElement => ({
  id,
  type: 'loot',
  itemId: 'potion-of-healing',
  x: 1,
  y: 2,
  quantity: 1,
  visible: true,
  ...overrides,
});

export const light: MapElement = {
  id: 'light-1',
  type: 'light',
  x: 1,
  y: 1,
  brightFeet: 20,
  dimFeet: 40,
  color: '#ffcc80',
  enabled: true,
  shape: 'circle',
  angle: 60,
};

export const spawn: MapElement = {
  id: 'spawn-1',
  type: 'spawn',
  kind: 'monster',
  x: 2,
  y: 2,
  source: { type: 'srd', monsterId: 'goblin' },
  label: 'Goblin',
  size: 1,
  hidden: false,
  quantity: 1,
};

export const start: MapElement = {
  id: 'start-1',
  type: 'start',
  x: 3,
  y: 3,
  label: 'PG 1',
};

export const wall: WallSegment = {
  id: 'wall-1',
  kind: 'wall',
  a: { x: 0, y: 0 },
  b: { x: 2, y: 0 },
};

export const area: BlockedArea = {
  id: 'area-1',
  shape: 'rect',
  points: [{ x: 4, y: 4 }, { x: 6, y: 6 }],
};

export const lootA = loot('loot-1', {
  itemId: 'potion-of-healing',
  quantity: 4,
  visible: false,
  x: 3,
  y: 5,
});
export const lootB = loot('loot-2', { itemId: 'rope', x: 7, y: 8 });

const srdItem = (
  id: string,
  name: string,
  type: string,
  overrides: Partial<SrdItem> = {},
): SrdItem => ({
  id,
  name,
  type,
  category: 'other',
  valueGp: 0,
  weightLb: 0,
  description: '',
  data: {} as SrdItem['data'],
  ...overrides,
});

export const potion = srdItem('potion-of-healing', 'Pozione di guarigione', 'Pozione');
export const rope = srdItem('rope', 'Corda di canapa', 'Equipaggiamento');

export const catalogItems: WritableSignal<SrdItem[]> = signal<SrdItem[]>([potion, rope]);

export const baseDocument = (): MapDocument => emptyMapDocument('Loot', null, 700, 700);

export const withItems = (
  doc: MapDocument,
  constraintsItems: MapLayers[2]['items'],
  elementsItems: MapLayers[3]['items'],
): MapDocument => {
  const [background, graphics, constraints, elements] = doc.layers;
  return {
    ...doc,
    layers: [
      background,
      graphics,
      { ...constraints, items: constraintsItems },
      { ...elements, items: elementsItems },
    ],
  };
};

export const withLocked = (doc: MapDocument, kinds: readonly MapLayerKind[]): MapDocument => ({
  ...doc,
  layers: doc.layers.map((layer) =>
    kinds.includes(layer.kind) ? { ...layer, locked: true } : layer,
  ) as MapLayers,
});

export const toMap = (doc: MapDocument): Map => ({
  id: MAP_ID,
  campaignId: 'campaign-loot',
  imageAssetId: null,
  thumbAssetId: null,
  compositeAssetId: null,
  version: 1,
  createdAt: '2026-11-04T00:00:00.000Z',
  updatedAt: '2026-11-04T00:00:00.000Z',
  ...doc,
});

export const elementsOf = (doc: MapDocument | null): MapLayers[3]['items'] =>
  doc?.layers[3].items ?? [];

export const lootOf = (doc: MapDocument | null): LootElement[] =>
  elementsOf(doc).filter((item): item is LootElement => item.type === 'loot');

export const idsOf = (doc: MapDocument | null): string[] =>
  elementsOf(doc).map((item) => item.id);

export const rootOf = (fixture: ComponentFixture<MapEditorPage>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

export const lootDialog = (
  fixture: ComponentFixture<MapEditorPage>,
): MapLootDialogComponent | null => {
  const debug = fixture.debugElement.query(By.directive(MapLootDialogComponent));
  return debug === null ? null : debug.componentInstance as MapLootDialogComponent;
};

/** Sezione inspector del loot: id canonico oppure sezione con i suoi campi. */
export const lootSection = (fixture: ComponentFixture<MapEditorPage>): HTMLElement | null => {
  const root = rootOf(fixture);
  const byId = root.querySelector<HTMLElement>('#map-loot');
  if (byId !== null) {
    return byId;
  }
  return Array.from(root.querySelectorAll<HTMLElement>('app-sidebar-section')).find((section) => {
    const text = section.textContent ?? '';
    return text.includes('Quantità') && (
      text.includes('Visibile ai giocatori') || text.includes('Visibilità')
    );
  }) ?? null;
};

export const buttonIn = (container: HTMLElement, name: string): HTMLButtonElement => {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((entry) =>
    `${entry.getAttribute('aria-label') ?? ''} ${entry.textContent ?? ''}`.includes(name),
  );
  if (button === undefined) {
    throw new Error(`bottone ${name} assente`);
  }
  return button;
};
