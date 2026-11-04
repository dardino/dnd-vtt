import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  mapDocumentSchema,
  type ImageGraphic,
  type Map,
  type MapDocument,
  type MapGraphic,
  type PolygonGraphic,
  type TextGraphic,
} from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActorService } from '../../core/services/actor.service';
import { AssetService } from '../../core/services/asset.service';
import { MapService } from '../../core/services/map.service';
import { SrdCatalogService } from '../../core/services/srd-catalog.service';
import {
  MAP_ID,
  baseDocument,
  graphicItem,
  graphicsOf,
  orderedIds,
  withGraphics,
  withLayerState,
  zValues,
} from './map-editor.page.graphics.test-helpers';
import { MapEditorPage } from './map-editor.page';

const toMap = (doc: MapDocument): Map => ({
  id: MAP_ID,
  campaignId: 'campaign-graphics-shapes',
  imageAssetId: null,
  thumbAssetId: null,
  compositeAssetId: null,
  version: 1,
  createdAt: '2026-11-04T00:00:00.000Z',
  updatedAt: '2026-11-04T00:00:00.000Z',
  ...doc,
});

const polygon = (
  id: string,
  z: number,
  overrides: Partial<PolygonGraphic> = {},
): PolygonGraphic => ({
  kind: 'polygon',
  id,
  points: [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 2 }],
  fill: '#4ea1ff',
  opacity: 0.35,
  z,
  ...overrides,
});

const text = (
  id: string,
  z: number,
  overrides: Partial<TextGraphic> = {},
): TextGraphic => ({
  kind: 'text',
  id,
  text: 'Testo',
  fontFamily: 'sans',
  fontSize: 24,
  color: '#ffffff',
  x: 10,
  y: 20,
  opacity: 1,
  z,
  ...overrides,
});

interface ShapePage {
  addGraphicPolygon(points: Array<{ x: number; y: number }>): void;
  addGraphicText(point: { x: number; y: number }): void;
  translateGraphic(event: { id: string; dx: number; dy: number }): void;
  updateGraphicField(field: string, value: number | string): void;
}

const shapesOf = (page: MapEditorPage): ShapePage => page;

const asImage = (item: MapGraphic | undefined): ImageGraphic => {
  if (item === undefined || item.kind !== 'image') {
    throw new Error('Grafica immagine attesa');
  }
  return item;
};

describe('MapEditorPage poligoni e testi', () => {
  const getMap = vi.fn();
  const saveMap = vi.fn();

  beforeEach(() => {
    getMap.mockReset();
    saveMap.mockReset();
    saveMap.mockResolvedValue({ version: 2 });
    TestBed.configureTestingModule({
      providers: [
        { provide: MapService, useValue: { get: getMap, save: saveMap } },
        { provide: AssetService, useValue: { upload: vi.fn(), get: vi.fn().mockRejectedValue(new Error('assente')) } },
        { provide: ActorService, useValue: { listByCampaign: vi.fn().mockResolvedValue([]) } },
        { provide: SrdCatalogService, useValue: { load: () => Promise.resolve(), catalog: () => null } },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
  });

  const render = async (
    doc: MapDocument = baseDocument(),
  ): Promise<ComponentFixture<MapEditorPage>> => {
    getMap.mockResolvedValue(toMap(doc));
    const fixture = TestBed.createComponent(MapEditorPage);
    fixture.componentRef.setInput('mapId', MAP_ID);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  it('addGraphicPolygon applica i default, seleziona ed entra in history', async () => {
    const fixture = await render(withGraphics(baseDocument(), [text('existing', 4)]));
    const page = fixture.componentInstance;
    page.setActiveLayer('graphics');

    shapesOf(page).addGraphicPolygon([{ x: 1, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 4 }]);

    const items = graphicsOf(page.doc());
    expect(items).toHaveLength(2);
    const added = items.find((entry) => entry.id !== 'existing');
    expect(added).toMatchObject({
      kind: 'polygon',
      points: [{ x: 1, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 4 }],
      fill: '#4ea1ff',
      opacity: 0.35,
      z: 5,
    });
    expect(page.selected()).toEqual({ type: 'graphic', id: added?.id });
    expect(page.dirty()).toBe(true);

    page.undo();
    expect(graphicsOf(page.doc()).map((entry) => entry.id)).toEqual(['existing']);
    page.redo();
    expect(graphicsOf(page.doc())).toHaveLength(2);

    fixture.destroy();
  });

  it('addGraphicText applica testo, font e coordinate intere di default', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;
    page.setActiveLayer('graphics');

    shapesOf(page).addGraphicText({ x: 123, y: 45 });

    const items = graphicsOf(page.doc());
    expect(items).toHaveLength(1);
    const added = items[0];
    expect(added).toMatchObject({
      kind: 'text',
      text: 'Testo',
      fontFamily: 'sans',
      fontSize: 24,
      color: '#ffffff',
      x: 123,
      y: 45,
      opacity: 1,
      z: 0,
    });
    expect(Number.isInteger((added as TextGraphic).x)).toBe(true);
    expect(Number.isInteger((added as TextGraphic).y)).toBe(true);
    expect(page.selected()).toEqual({ type: 'graphic', id: added?.id });
    expect(page.dirty()).toBe(true);

    page.undo();
    expect(graphicsOf(page.doc())).toEqual([]);

    fixture.destroy();
  });

  it('ignora poligoni e testi se il layer graphics è bloccato o invisibile', async () => {
    const cases = [
      { locked: true },
      { visible: false },
    ] as const;

    for (const patch of cases) {
      const doc = withLayerState(
        withGraphics(baseDocument(), [graphicItem('image-1')]),
        'graphics',
        patch,
      );
      const fixture = await render(doc);
      const page = fixture.componentInstance;
      page.setActiveLayer('graphics');
      const before = structuredClone(page.doc());

      shapesOf(page).addGraphicPolygon([{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 2 }]);
      shapesOf(page).addGraphicText({ x: 10, y: 10 });

      expect(page.doc()).toEqual(before);
      expect(page.dirty()).toBe(false);
      fixture.destroy();
    }
  });

  it('aggiorna fill e opacity del poligono con undo esatto', async () => {
    const doc = withGraphics(baseDocument(), [polygon('p1', 0)]);
    const fixture = await render(doc);
    const page = fixture.componentInstance;
    page.setActiveLayer('graphics');
    page.select({ type: 'graphic', id: 'p1' });

    shapesOf(page).updateGraphicField('fill', '#ff0000');
    shapesOf(page).updateGraphicField('opacity', 0.8);

    expect(graphicsOf(page.doc())[0]).toMatchObject({ fill: '#ff0000', opacity: 0.8 });

    page.undo();
    page.undo();
    expect(page.doc()).toEqual(doc);

    page.redo();
    page.redo();
    expect(graphicsOf(page.doc())[0]).toMatchObject({ fill: '#ff0000', opacity: 0.8 });

    fixture.destroy();
  });

  it('aggiorna tutti i campi del testo con undo completo', async () => {
    const doc = withGraphics(baseDocument(), [text('t1', 0)]);
    const fixture = await render(doc);
    const page = fixture.componentInstance;
    page.setActiveLayer('graphics');
    page.select({ type: 'graphic', id: 't1' });

    const updates: Array<[string, number | string]> = [
      ['text', 'Nuovo titolo'],
      ['fontFamily', 'serif'],
      ['fontSize', 32],
      ['color', '#ffcc00'],
      ['x', 12],
      ['y', 34],
      ['opacity', 0.5],
    ];
    for (const [field, value] of updates) {
      shapesOf(page).updateGraphicField(field, value);
    }

    expect(graphicsOf(page.doc())[0]).toMatchObject({
      text: 'Nuovo titolo',
      fontFamily: 'serif',
      fontSize: 32,
      color: '#ffcc00',
      x: 12,
      y: 34,
      opacity: 0.5,
    });

    for (let index = 0; index < updates.length; index += 1) {
      page.undo();
    }
    expect(page.doc()).toEqual(doc);

    fixture.destroy();
  });

  it('ignora i valori invalidi di poligoni e testi senza sporcare la history', async () => {
    const doc = withGraphics(baseDocument(), [polygon('p1', 0), text('t1', 1)]);
    const fixture = await render(doc);
    const page = fixture.componentInstance;
    page.setActiveLayer('graphics');
    const before = structuredClone(page.doc());

    page.select({ type: 'graphic', id: 'p1' });
    for (const [field, value] of [
      ['fill', 'red'],
      ['fill', '#fff'],
      ['opacity', 2],
      ['opacity', -0.5],
    ] as const) {
      shapesOf(page).updateGraphicField(field, value);
    }

    page.select({ type: 'graphic', id: 't1' });
    for (const [field, value] of [
      ['text', ''],
      ['text', 'a'.repeat(121)],
      ['text', 'a\nb'],
      ['text', 'a\rb'],
      ['fontFamily', 'comic'],
      ['fontSize', 7],
      ['fontSize', 201],
      ['fontSize', 7.5],
      ['color', 'white'],
      ['color', '#fff'],
      ['opacity', 2],
      ['x', Number.NaN],
    ] as const) {
      shapesOf(page).updateGraphicField(field, value);
    }

    expect(page.doc()).toEqual(before);
    expect(page.dirty()).toBe(false);

    fixture.destroy();
  });

  it('rifiuta coordinate frazionarie del testo mantenendo il documento valido', async () => {
    const doc = withGraphics(baseDocument(), [text('t1', 0)]);
    const fixture = await render(doc);
    const page = fixture.componentInstance;
    page.setActiveLayer('graphics');
    page.select({ type: 'graphic', id: 't1' });
    const before = structuredClone(page.doc());

    shapesOf(page).updateGraphicField('x', 12.5);
    shapesOf(page).updateGraphicField('y', 3.7);

    expect(page.doc()).toEqual(before);
    expect(page.dirty()).toBe(false);
    expect(mapDocumentSchema.safeParse(page.doc()).success).toBe(true);

    shapesOf(page).updateGraphicField('x', 12);
    shapesOf(page).updateGraphicField('y', 34);

    expect(graphicsOf(page.doc())[0]).toMatchObject({ x: 12, y: 34 });
    expect(mapDocumentSchema.safeParse(page.doc()).success).toBe(true);

    page.undo();
    page.undo();
    expect(page.doc()).toEqual(doc);

    fixture.destroy();
  });

  it('moveGraphic arrotonda un testo al pixel intero, clampa ai bordi e usa un solo comando', async () => {
    const doc = withGraphics(baseDocument(), [text('t1', 0)]);
    const fixture = await render(doc);
    const page = fixture.componentInstance;
    page.setActiveLayer('graphics');
    page.select({ type: 'graphic', id: 't1' });

    page.moveGraphic({ id: 't1', x: 123.4, y: 57.9 });
    expect(graphicsOf(page.doc())[0]).toMatchObject({ x: 123, y: 58 });
    expect(mapDocumentSchema.safeParse(page.doc()).success).toBe(true);

    page.undo();
    expect(page.doc()).toEqual(doc);

    page.moveGraphic({ id: 't1', x: -30, y: 5000 });
    const moved = graphicsOf(page.doc())[0] as TextGraphic;
    expect(moved.x).toBe(0);
    expect(moved.y).toBeGreaterThanOrEqual(0);
    expect(moved.y).toBeLessThanOrEqual(700);

    fixture.destroy();
  });

  it('moveGraphic clampa anche le immagini', async () => {
    const doc = withGraphics(baseDocument(), [graphicItem('image-1')]);
    const fixture = await render(doc);
    const page = fixture.componentInstance;
    page.setActiveLayer('graphics');

    page.moveGraphic({ id: 'image-1', x: -100, y: 5000 });

    const moved = asImage(graphicsOf(page.doc())[0]);
    expect(moved.x).toBe(0);
    expect(moved.y).toBeGreaterThanOrEqual(0);
    expect(moved.y).toBeLessThanOrEqual(700);

    fixture.destroy();
  });

  it('translateGraphic sposta il poligono di celle intere con undo esatto', async () => {
    const doc = withGraphics(baseDocument(), [polygon('p1', 0)]);
    const fixture = await render(doc);
    const page = fixture.componentInstance;
    page.setActiveLayer('graphics');
    page.select({ type: 'graphic', id: 'p1' });

    shapesOf(page).translateGraphic({ id: 'p1', dx: 2, dy: 1 });

    expect((graphicsOf(page.doc())[0] as PolygonGraphic).points).toEqual([
      { x: 3, y: 2 },
      { x: 5, y: 2 },
      { x: 5, y: 3 },
    ]);

    page.undo();
    expect(page.doc()).toEqual(doc);

    fixture.destroy();
  });

  it('translateGraphic clampa ai bordi della mappa mantenendo la forma', async () => {
    const item = polygon('p1', 0, {
      points: [{ x: 8, y: 8 }, { x: 9, y: 8 }, { x: 9, y: 9 }],
    });
    const fixture = await render(withGraphics(baseDocument(), [item]));
    const page = fixture.componentInstance;
    page.setActiveLayer('graphics');
    page.select({ type: 'graphic', id: 'p1' });

    shapesOf(page).translateGraphic({ id: 'p1', dx: 100, dy: 0 });
    const moved = graphicsOf(page.doc())[0] as PolygonGraphic;

    const xs = moved.points.map((point) => point.x);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(10);
    expect(moved.points[1]!.x - moved.points[0]!.x).toBe(1);
    expect(moved.points[2]!.y - moved.points[0]!.y).toBe(1);

    shapesOf(page).translateGraphic({ id: 'p1', dx: -100, dy: 0 });
    const back = graphicsOf(page.doc())[0] as PolygonGraphic;
    expect(Math.min(...back.points.map((point) => point.x))).toBeGreaterThanOrEqual(0);

    fixture.destroy();
  });

  it('removeSelected rimuove poligoni e testi e undo li reinserisce a indice e z originali', async () => {
    const doc = withGraphics(baseDocument(), [
      graphicItem('image-1', { z: 0 }),
      polygon('p1', 1),
      text('t1', 2),
    ]);
    const fixture = await render(doc);
    const page = fixture.componentInstance;
    page.setActiveLayer('graphics');

    page.select({ type: 'graphic', id: 'p1' });
    page.removeSelected();

    expect(orderedIds(page.doc())).toEqual(['image-1', 't1']);
    expect(zValues(page.doc())).toEqual([0, 1]);

    page.undo();
    expect(page.doc()).toEqual(doc);

    page.select({ type: 'graphic', id: 't1' });
    page.removeSelected();
    expect(orderedIds(page.doc())).toEqual(['image-1', 'p1']);

    page.undo();
    expect(page.doc()).toEqual(doc);

    fixture.destroy();
  });
});
