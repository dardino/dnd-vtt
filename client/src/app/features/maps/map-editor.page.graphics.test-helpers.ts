import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  emptyMapDocument,
  type Asset,
  type ImageGraphic,
  type MapDocument,
  type MapGraphic,
  type MapLayerKind,
  type MapLayers,
} from '@dnd-vtt/shared';
import { MapEditorCanvasComponent } from './map-editor-canvas.component';
import type { MapEditorPage } from './map-editor.page';

export const MAP_ID = 'map-graphics';
export const GRAPHIC_ASSET_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

export const asset: Asset = {
  id: 'c0ffee00-0000-4000-8000-0000000000a1',
  hash: 'b'.repeat(64),
  mime: 'image/png',
  bytes: 2048,
  width: 200,
  height: 100,
  url: '/uploads/graphic.png',
  previewUrl: '/uploads/graphic-preview.png',
  thumbUrl: '/uploads/graphic-thumb.png',
  createdAt: '2026-11-04T00:00:00.000Z',
};

export const baseDocument = (): MapDocument => emptyMapDocument('Grafica', null, 700, 700);

export const graphicItem = (
  id: string,
  overrides: Partial<Omit<ImageGraphic, 'id'>> = {},
): MapGraphic => ({
  id,
  kind: 'image',
  assetId: GRAPHIC_ASSET_ID,
  x: 10,
  y: 20,
  scale: 1,
  rotation: 0,
  flipH: false,
  flipV: false,
  opacity: 1,
  z: 0,
  ...overrides,
});

export const g1 = graphicItem('g1', { z: 0 });
export const g2 = graphicItem('g2', { z: 1 });
export const g3 = graphicItem('g3', { z: 2 });

export const withGraphics = (doc: MapDocument, items: MapGraphic[]): MapDocument => {
  const [background, graphics, constraints, elements] = doc.layers;
  return {
    ...doc,
    layers: [background, { ...graphics, items }, constraints, elements],
  };
};

export const withLayerState = (
  doc: MapDocument,
  kind: MapLayerKind,
  patch: { visible?: boolean; locked?: boolean },
): MapDocument => ({
  ...doc,
  layers: doc.layers.map((layer) =>
    layer.kind === kind ? { ...layer, ...patch } : layer,
  ) as MapLayers,
});

export const graphicsOf = (doc: MapDocument | null): MapGraphic[] => doc?.layers[1].items ?? [];

export const orderedIds = (doc: MapDocument | null): string[] =>
  [...graphicsOf(doc)].sort((a, b) => a.z - b.z).map((entry) => entry.id);

export const zValues = (doc: MapDocument | null): number[] =>
  graphicsOf(doc).map((entry) => entry.z).sort((a, b) => a - b);

/**
 * Evento `change` con i file indicati. Senza argomenti simula un singolo
 * `decor.png`; con un array vuoto simula la chiusura del picker senza scelta.
 */
export const chooseFile = (names: string[] = ['decor.png']): Event => {
  const input = document.createElement('input');
  Object.defineProperty(input, 'files', {
    value: names.map((name) => new File(['image'], name, { type: 'image/png' })),
  });
  return { target: input } as unknown as Event;
};

export const canvasOf = (fixture: ComponentFixture<MapEditorPage>): MapEditorCanvasComponent => {
  const debug = fixture.debugElement.query(By.directive(MapEditorCanvasComponent));
  if (debug === null) {
    throw new Error('canvas dell’editor assente');
  }
  return debug.componentInstance as MapEditorCanvasComponent;
};

/** Attende le risoluzioni asincrone degli asset e allinea gli effect signal. */
export const flush = async (fixture: ComponentFixture<MapEditorPage>): Promise<void> => {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve();
  }
  TestBed.tick();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
};

export const rootOf = (fixture: ComponentFixture<MapEditorPage>): HTMLElement =>
  fixture.nativeElement as HTMLElement;
