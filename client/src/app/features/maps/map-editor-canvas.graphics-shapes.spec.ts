import { TestBed } from '@angular/core/testing';
import type { ImageGraphic, MapGraphic, PolygonGraphic, TextGraphic } from '@dnd-vtt/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapEditorCanvasComponent } from './map-editor-canvas.component';
import {
  collect,
  dragNodeTo,
  draggableNodes,
  flagsFor,
  keyDown,
  mountShapes,
  outputsOf,
  pointerDown,
  type Harness,
} from './map-editor-canvas.shapes-helper.spec';

vi.mock('konva', () => import('./map-editor-canvas.konva-mock'));

const ASSET_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

const polygon = (overrides: Partial<PolygonGraphic> = {}): PolygonGraphic => ({
  kind: 'polygon',
  id: 'polygon-1',
  points: [{ x: 1, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 4 }],
  fill: '#4ea1ff',
  opacity: 0.35,
  z: 0,
  ...overrides,
});

const text = (overrides: Partial<TextGraphic> = {}): TextGraphic => ({
  kind: 'text',
  id: 'text-1',
  text: 'Ciao',
  fontFamily: 'sans',
  fontSize: 24,
  color: '#ffffff',
  x: 100,
  y: 100,
  opacity: 1,
  z: 0,
  ...overrides,
});

const image = (overrides: Partial<ImageGraphic> = {}): ImageGraphic => ({
  kind: 'image',
  id: 'image-1',
  assetId: ASSET_ID,
  x: 100,
  y: 100,
  scale: 1,
  rotation: 0,
  flipH: false,
  flipV: false,
  opacity: 1,
  z: 0,
  ...overrides,
});

const entry = (item: MapGraphic) => ({ item, image: null });

const outputs = (harness: Harness) => outputsOf(harness.fixture.componentInstance);

/** Tre click ai vertici del poligono di prova (celle 0,0 - 2,0 - 2,1). */
const draftTriangle = (harness: Harness): void => {
  pointerDown(harness, 10, 10);
  pointerDown(harness, 150, 10);
  pointerDown(harness, 150, 80);
};

describe('MapEditorCanvasComponent poligoni', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      public observe(): void {} public unobserve(): void {} public disconnect(): void {}
    });
    TestBed.configureTestingModule({ imports: [MapEditorCanvasComponent] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('con Enter emette i vertici snapped alle celle della griglia', () => {
    const harness = mountShapes({ tool: 'graphicPolygon' });
    const drawn = collect(outputs(harness).graphicPolygonDrawn);

    draftTriangle(harness);
    keyDown(harness, 'Enter');

    expect(drawn).toEqual([{
      points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }],
    }]);
    harness.fixture.destroy();
  });

  it('aggancia al nodo del reticolo più vicino, non al pixel grezzo', () => {
    const harness = mountShapes({ tool: 'graphicPolygon' });
    const drawn = collect(outputs(harness).graphicPolygonDrawn);

    pointerDown(harness, 139, 72);
    pointerDown(harness, 212, 8);
    pointerDown(harness, 212, 141);
    keyDown(harness, 'Enter');

    expect(drawn[0]?.points).toEqual([{ x: 2, y: 1 }, { x: 3, y: 0 }, { x: 3, y: 2 }]);
    harness.fixture.destroy();
  });

  it('ignora i click consecutivi sullo stesso vertice', () => {
    const harness = mountShapes({ tool: 'graphicPolygon' });
    const drawn = collect(outputs(harness).graphicPolygonDrawn);

    pointerDown(harness, 10, 10);
    pointerDown(harness, 12, 12);
    pointerDown(harness, 150, 10);
    pointerDown(harness, 150, 10);
    pointerDown(harness, 150, 80);
    keyDown(harness, 'Enter');

    expect(drawn).toHaveLength(1);
    expect(drawn[0]?.points).toHaveLength(3);
    harness.fixture.destroy();
  });

  it('chiude con doppio click', () => {
    const harness = mountShapes({ tool: 'graphicPolygon' });
    const drawn = collect(outputs(harness).graphicPolygonDrawn);

    draftTriangle(harness);
    pointerDown(harness, 150, 80, 2);

    expect(drawn).toHaveLength(1);
    harness.fixture.destroy();
  });

  it('con Esc annulla la bozza senza emettere nulla', () => {
    const harness = mountShapes({ tool: 'graphicPolygon' });
    const drawn = collect(outputs(harness).graphicPolygonDrawn);

    draftTriangle(harness);
    keyDown(harness, 'Escape');
    keyDown(harness, 'Enter');

    expect(drawn).toEqual([]);
    harness.fixture.destroy();
  });

  it('con meno di tre vertici non emette nulla', () => {
    const harness = mountShapes({ tool: 'graphicPolygon' });
    const drawn = collect(outputs(harness).graphicPolygonDrawn);

    pointerDown(harness, 10, 10);
    pointerDown(harness, 150, 10);
    keyDown(harness, 'Enter');

    expect(drawn).toEqual([]);
    harness.fixture.destroy();
  });

  it('con area nulla (vertici collineari) non emette nulla', () => {
    const harness = mountShapes({ tool: 'graphicPolygon' });
    const drawn = collect(outputs(harness).graphicPolygonDrawn);

    pointerDown(harness, 0, 0);
    pointerDown(harness, 70, 70);
    pointerDown(harness, 140, 140);
    keyDown(harness, 'Enter');

    expect(drawn).toEqual([]);
    harness.fixture.destroy();
  });
});

describe('MapEditorCanvasComponent testo', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      public observe(): void {} public unobserve(): void {} public disconnect(): void {}
    });
    TestBed.configureTestingModule({ imports: [MapEditorCanvasComponent] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const mapImage = { url: '', width: 700, height: 700 };

  it('emette graphicTextRequested in pixel mondo interi', () => {
    const harness = mountShapes({ tool: 'graphicText', image: mapImage });
    const requested = collect(outputs(harness).graphicTextRequested);

    pointerDown(harness, 123.4, 45.6);

    expect(requested).toEqual([{ x: 123, y: 46 }]);
    harness.fixture.destroy();
  });

  it('clampa il punto ai bordi della mappa', () => {
    const harness = mountShapes({ tool: 'graphicText', image: mapImage });
    const requested = collect(outputs(harness).graphicTextRequested);

    pointerDown(harness, -25, 1200);
    pointerDown(harness, 900, -10);

    expect(requested).toEqual([
      { x: 0, y: 700 },
      { x: 700, y: 0 },
    ]);
    harness.fixture.destroy();
  });

  it('con lo strumento select non emette richieste di testo', () => {
    const harness = mountShapes({ tool: 'select', image: mapImage });
    const requested = collect(outputs(harness).graphicTextRequested);

    pointerDown(harness, 100, 100);

    expect(requested).toEqual([]);
    harness.fixture.destroy();
  });
});

describe('MapEditorCanvasComponent selezione poligoni e testi', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      public observe(): void {} public unobserve(): void {} public disconnect(): void {}
    });
    TestBed.configureTestingModule({ imports: [MapEditorCanvasComponent] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('seleziona un poligono cliccando all’interno', () => {
    const harness = mountShapes({ graphics: [entry(polygon())] });
    harness.editor.renderAll();
    const selected = collect(outputs(harness).elementSelected);

    pointerDown(harness, 200, 150);

    expect(selected).toEqual([{ type: 'graphic', id: 'polygon-1' }]);
    harness.fixture.destroy();
  });

  it('include i bordi del poligono nell’hit-test', () => {
    const harness = mountShapes({ graphics: [entry(polygon())] });
    harness.editor.renderAll();
    const selected = collect(outputs(harness).elementSelected);

    // Punto medio del lato superiore: world (210, 70).
    pointerDown(harness, 210, 70);

    expect(selected).toEqual([{ type: 'graphic', id: 'polygon-1' }]);
    harness.fixture.destroy();
  });

  it('non seleziona un poligono cliccando fuori', () => {
    const harness = mountShapes({ graphics: [entry(polygon())] });
    harness.editor.renderAll();
    const selected = collect(outputs(harness).elementSelected);

    pointerDown(harness, 200, 500);

    expect(selected).toEqual([null]);
    harness.fixture.destroy();
  });

  it('seleziona un testo dentro il bounding box stimato', () => {
    const harness = mountShapes({ graphics: [entry(text())] });
    harness.editor.renderAll();
    const selected = collect(outputs(harness).elementSelected);

    pointerDown(harness, 102, 102);

    expect(selected).toEqual([{ type: 'graphic', id: 'text-1' }]);
    harness.fixture.destroy();
  });

  it('non seleziona un testo lontano dal bounding box', () => {
    const harness = mountShapes({ graphics: [entry(text())] });
    harness.editor.renderAll();
    const selected = collect(outputs(harness).elementSelected);

    pointerDown(harness, 100, 500);

    expect(selected).toEqual([null]);
    harness.fixture.destroy();
  });

  it('con grafiche sovrapposte vince lo z più alto tra tipi diversi', () => {
    const harness = mountShapes({
      graphics: [
        entry(polygon({ id: 'polygon-low', z: 0 })),
        entry(text({ id: 'text-high', z: 5 })),
      ],
    });
    harness.editor.renderAll();
    const selected = collect(outputs(harness).elementSelected);

    pointerDown(harness, 105, 105);

    expect(selected).toEqual([{ type: 'graphic', id: 'text-high' }]);
    harness.fixture.destroy();
  });

  it('non seleziona poligoni o testi di un layer bloccato', () => {
    const harness = mountShapes({
      graphics: [entry(polygon()), entry(text({ z: 2 }))],
      layerFlags: flagsFor('graphics', { locked: true }),
    });
    harness.editor.renderAll();
    const selected = collect(outputs(harness).elementSelected);

    pointerDown(harness, 200, 150);
    pointerDown(harness, 105, 105);

    expect(selected).toEqual([null, null]);
    harness.fixture.destroy();
  });

  it('non seleziona grafiche di un layer invisibile', () => {
    const harness = mountShapes({
      graphics: [entry(polygon()), entry(text({ z: 2 }))],
      layerFlags: flagsFor('graphics', { visible: false }),
    });
    harness.editor.renderAll();
    const selected = collect(outputs(harness).elementSelected);

    pointerDown(harness, 200, 150);
    pointerDown(harness, 105, 105);

    expect(selected).toEqual([null, null]);
    expect(harness.layers.graphics.children).toHaveLength(0);
    harness.fixture.destroy();
  });
});

describe('MapEditorCanvasComponent trascinamento poligoni e testi', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      public observe(): void {} public unobserve(): void {} public disconnect(): void {}
    });
    TestBed.configureTestingModule({ imports: [MapEditorCanvasComponent] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('trascina un poligono emettendo delta in celle intere arrotondate', () => {
    const item = polygon();
    const harness = mountShapes({ graphics: [entry(item)] });
    harness.editor.renderAll();
    const translated = collect(outputs(harness).graphicTranslated);

    dragNodeTo(harness, 75, 140);

    expect(translated).toEqual([{ id: 'polygon-1', dx: 1, dy: 2 }]);
    // Durante il drag i vertici non vengono agganciati singolarmente.
    expect(item.points).toEqual([{ x: 1, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 4 }]);
    harness.fixture.destroy();
  });

  it('arrotonda al valore intero più vicino i delta sotto la cella', () => {
    const harness = mountShapes({ graphics: [entry(polygon())] });
    harness.editor.renderAll();
    const translated = collect(outputs(harness).graphicTranslated);

    dragNodeTo(harness, 40, 40);

    expect(translated).toEqual([{ id: 'polygon-1', dx: 1, dy: 1 }]);
    harness.fixture.destroy();
  });

  it('trascina un testo emettendo le coordinate mondo libere al pixel', () => {
    const harness = mountShapes({ graphics: [entry(text())] });
    harness.editor.renderAll();
    const moved = collect(outputs(harness).graphicMoved);

    dragNodeTo(harness, 123.4, 57.9);

    // Il canvas emette le coordinate mondo grezze: l'arrotondamento all'intero
    // richiesto dallo schema dei testi avviene nella pagina (`moveGraphic`).
    expect(moved).toEqual([{ id: 'text-1', x: 123.4, y: 57.9 }]);
    harness.fixture.destroy();
  });

  it('non rende trascinabili poligoni e testi di un layer bloccato', () => {
    const harness = mountShapes({
      graphics: [entry(polygon()), entry(text({ z: 2 }))],
      layerFlags: flagsFor('graphics', { locked: true }),
    });
    harness.editor.renderAll();

    expect(draggableNodes(harness.layers.graphics)).toHaveLength(0);
    harness.fixture.destroy();
  });

  it('non rende trascinabili poligoni e testi di un layer invisibile', () => {
    const harness = mountShapes({
      graphics: [entry(polygon()), entry(text({ z: 2 }))],
      layerFlags: flagsFor('graphics', { visible: false }),
    });
    harness.editor.renderAll();

    expect(draggableNodes(harness.layers.graphics)).toHaveLength(0);
    harness.fixture.destroy();
  });
});

describe('MapEditorCanvasComponent frecce su grafiche', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      public observe(): void {} public unobserve(): void {} public disconnect(): void {}
    });
    TestBed.configureTestingModule({ imports: [MapEditorCanvasComponent] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sposta un’immagine di una cella con le frecce', () => {
    const harness = mountShapes({
      graphics: [{ item: image(), image: { url: '/img.png', width: 40, height: 40 } }],
      selected: { type: 'graphic', id: 'image-1' },
    });
    const moved = collect(outputs(harness).graphicMoved);

    keyDown(harness, 'ArrowRight');

    expect(moved).toEqual([{ id: 'image-1', x: 170, y: 100 }]);
    harness.fixture.destroy();
  });

  it('sposta un testo di una cella con le frecce', () => {
    const harness = mountShapes({
      graphics: [entry(text())],
      selected: { type: 'graphic', id: 'text-1' },
    });
    const moved = collect(outputs(harness).graphicMoved);

    keyDown(harness, 'ArrowDown');

    expect(moved).toEqual([{ id: 'text-1', x: 100, y: 170 }]);
    harness.fixture.destroy();
  });

  it('sposta un poligono di una cella con le frecce', () => {
    const harness = mountShapes({
      graphics: [entry(polygon())],
      selected: { type: 'graphic', id: 'polygon-1' },
    });
    const moved = collect(outputs(harness).graphicTranslated);

    keyDown(harness, 'ArrowLeft');

    expect(moved).toEqual([{ id: 'polygon-1', dx: -1, dy: 0 }]);
    harness.fixture.destroy();
  });

  it('non muove grafiche su layer bloccato o invisibile', () => {
    for (const flags of [
      flagsFor('graphics', { locked: true }),
      flagsFor('graphics', { visible: false }),
    ]) {
      const harness = mountShapes({
        graphics: [entry(polygon()), entry(text({ z: 2 }))],
        selected: { type: 'graphic', id: 'text-1' },
        layerFlags: flags,
      });
      const moved = collect(outputs(harness).graphicMoved);
      const translated = collect(outputs(harness).graphicTranslated);

      keyDown(harness, 'ArrowRight');
      keyDown(harness, 'ArrowDown');

      expect(moved).toEqual([]);
      expect(translated).toEqual([]);
      harness.fixture.destroy();
    }
  });
});
