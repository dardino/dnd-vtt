import {
  emptyMapDocument,
  type MapDocument,
  type MapGraphic,
  type MapLayerKind,
  type PolygonGraphic,
  type TextGraphic,
} from '@dnd-vtt/shared';
import { describe, expect, it } from 'vitest';
import {
  arrayInsert,
  arrayRemove,
  moveGraphicZ,
  removeGraphic,
  replaceFields,
  type GraphicZDirection,
  type MapCommand,
} from './map-command';

const GRAPHIC_ASSET_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

const graphic = (id: string, z: number): MapGraphic => ({
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
  z,
});

const g1 = graphic('graphic-1', 0);
const g2 = graphic('graphic-2', 1);

const polygon = (
  id: string,
  z: number,
  overrides: Partial<PolygonGraphic> = {},
): PolygonGraphic => ({
  kind: 'polygon',
  id,
  points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }],
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
  text: 'Sala',
  fontFamily: 'sans',
  fontSize: 24,
  color: '#ffffff',
  x: 10,
  y: 20,
  opacity: 1,
  z,
  ...overrides,
});

const baseDocument = (): MapDocument => emptyMapDocument('Grafica', null, 1280, 720);

const withGraphics = (items: MapGraphic[]): MapDocument => {
  const doc = baseDocument();
  const [background, graphics, constraints, elements] = doc.layers;
  return { ...doc, layers: [background, { ...graphics, items }, constraints, elements] };
};

const graphicsDocument = (): MapDocument => withGraphics([g1, g2]);

const gappedDocument = (): MapDocument =>
  withGraphics([graphic('a', 0), graphic('b', 4), graphic('c', 9)]);

const graphicsOf = (doc: MapDocument): MapGraphic[] => doc.layers[1].items;

const orderOf = (doc: MapDocument): string[] =>
  [...graphicsOf(doc)].sort((a, b) => a.z - b.z).map((entry) => entry.id);

const zValues = (doc: MapDocument): number[] =>
  graphicsOf(doc).map((entry) => entry.z).sort((a, b) => a - b);

const run = (doc: MapDocument, command: MapCommand, mode: 'apply' | 'invert'): MapDocument => {
  const next = structuredClone(doc);
  if (mode === 'apply') {
    command.apply(next);
  } else {
    command.invert(next);
  }
  return next;
};

const layerOf = (doc: MapDocument, kind: MapLayerKind) =>
  doc.layers.find((layer) => layer.kind === kind);

describe('arrayInsert graphic', () => {
  it('inserisce all’indice richiesto e ripristina con invert', () => {
    const doc = graphicsDocument();
    const command = arrayInsert('graphic', [graphic('graphic-3', 2)], 1);

    const applied = run(doc, command, 'apply');
    expect(graphicsOf(applied).map((entry) => entry.id))
      .toEqual(['graphic-1', 'graphic-3', 'graphic-2']);

    expect(run(applied, command, 'invert')).toEqual(doc);
    expect(run(doc, command, 'invert')).toEqual(doc);
  });

  it('tocca solo il layer graphics', () => {
    const doc = graphicsDocument();
    const applied = run(doc, arrayInsert('graphic', [graphic('graphic-3', 2)]), 'apply');

    expect(applied.layers[0]).toEqual(doc.layers[0]);
    expect(layerOf(applied, 'constraints')).toEqual(layerOf(doc, 'constraints'));
    expect(layerOf(applied, 'elements')).toEqual(layerOf(doc, 'elements'));
  });

  it('non muta il documento ricevuto', () => {
    const doc = graphicsDocument();
    const before = structuredClone(doc);

    run(doc, arrayInsert('graphic', [graphic('graphic-3', 2)]), 'apply');

    expect(doc).toEqual(before);
  });
});

describe('arrayRemove graphic', () => {
  it('rimuove per id e ripristina all’indice originale', () => {
    const doc = graphicsDocument();
    const command = arrayRemove('graphic', g2, 1);

    const applied = run(doc, command, 'apply');
    expect(graphicsOf(applied).map((entry) => entry.id)).toEqual(['graphic-1']);

    expect(run(applied, command, 'invert')).toEqual(doc);
    expect(run(doc, command, 'apply')).toEqual(applied);
  });

  it('id inesistente è un no-op in apply', () => {
    const doc = graphicsDocument();
    const command = arrayRemove('graphic', graphic('missing', 5), 0);

    expect(run(doc, command, 'apply')).toEqual(doc);
  });
});

describe('replaceFields graphic', () => {
  it('aggiorna x/y/scale/rotation/opacity della grafica target', () => {
    const doc = graphicsDocument();
    const command = replaceFields(
      'graphic',
      g1.id,
      { x: 10, y: 20, scale: 1, rotation: 0, opacity: 1 },
      { x: 120.5, y: -8, scale: 2.25, rotation: 90, opacity: 0.4 },
    );

    const applied = run(doc, command, 'apply');
    expect(graphicsOf(applied)[0]).toMatchObject({
      id: g1.id,
      x: 120.5,
      y: -8,
      scale: 2.25,
      rotation: 90,
      opacity: 0.4,
    });
    expect(graphicsOf(applied)[1]).toEqual(g2);

    expect(run(applied, command, 'invert')).toEqual(doc);
    expect(run(doc, command, 'invert')).toEqual(doc);
  });
});

describe('moveGraphicZ', () => {
  /** Tre grafiche con z 0..2, così ogni direzione ha un esito distinto. */
  const threeGraphics = (): MapDocument =>
    withGraphics([graphic('graphic-1', 0), graphic('graphic-2', 1), graphic('graphic-3', 2)]);

  const cases: ReadonlyArray<{
    direction: GraphicZDirection;
    id: string;
    expected: string[];
  }> = [
    { direction: 'up', id: 'graphic-1', expected: ['graphic-2', 'graphic-1', 'graphic-3'] },
    { direction: 'top', id: 'graphic-1', expected: ['graphic-2', 'graphic-3', 'graphic-1'] },
    { direction: 'down', id: 'graphic-3', expected: ['graphic-1', 'graphic-3', 'graphic-2'] },
    { direction: 'bottom', id: 'graphic-3', expected: ['graphic-3', 'graphic-1', 'graphic-2'] },
  ];

  for (const { direction, id, expected } of cases) {
    it(`sposta ${direction}, normalizza z e ripristina con undo/redo`, () => {
      const doc = threeGraphics();
      const command = moveGraphicZ(id, direction);

      const applied = run(doc, command, 'apply');
      expect(orderOf(applied)).toEqual(expected);
      expect(zValues(applied)).toEqual([0, 1, 2]);

      const undone = run(applied, command, 'invert');
      expect(undone).toEqual(doc);

      expect(run(undone, command, 'apply')).toEqual(applied);
    });
  }

  it('chiude i buchi di z senza duplicati', () => {
    const doc = gappedDocument();
    const applied = run(doc, moveGraphicZ('a', 'top'), 'apply');

    expect(orderOf(applied)).toEqual(['b', 'c', 'a']);
    expect(zValues(applied)).toEqual([0, 1, 2]);
  });

  it('l’undo ripristina i valori z originali non normalizzati', () => {
    const doc = gappedDocument();
    const command = moveGraphicZ('b', 'down');
    const applied = run(doc, command, 'apply');

    expect(zValues(applied)).toEqual([0, 1, 2]);
    expect(run(applied, command, 'invert')).toEqual(doc);
  });

  it('spostare su/giù agli estremi è un no-op', () => {
    const doc = threeGraphics();

    expect(run(doc, moveGraphicZ('graphic-3', 'up'), 'apply')).toEqual(doc);
    expect(run(doc, moveGraphicZ('graphic-1', 'bottom'), 'apply')).toEqual(doc);
  });

  it('id inesistente è un no-op sia in apply sia in invert', () => {
    const doc = threeGraphics();
    const command = moveGraphicZ('missing', 'top');

    expect(run(doc, command, 'apply')).toEqual(doc);
    expect(run(doc, command, 'invert')).toEqual(doc);
  });

  it('espone un label non vuoto e stima i byte', () => {
    const command = moveGraphicZ('graphic-1', 'top');

    expect(command.label).not.toBe('');
    expect(command.bytes).toBeGreaterThan(0);
  });
});

describe('removeGraphic', () => {
  it('id inesistente è un no-op in apply e invert, senza grafica fantasma', () => {
    const doc = graphicsDocument();
    const command = removeGraphic(graphic('missing', 5), 1);

    expect(run(doc, command, 'invert')).toEqual(doc);

    const applied = run(doc, command, 'apply');
    expect(applied).toEqual(doc);
    expect(graphicsOf(run(applied, command, 'invert'))).toHaveLength(2);
    expect(run(applied, command, 'invert')).toEqual(doc);
  });

  it('round-trip su id valido rimuove e ripristina indice e z', () => {
    const doc = graphicsDocument();
    const command = removeGraphic(g2, 1);

    const applied = run(doc, command, 'apply');
    expect(graphicsOf(applied).map((entry) => entry.id)).toEqual(['graphic-1']);

    expect(run(applied, command, 'invert')).toEqual(doc);
  });
});

describe('collezioni grafiche miste', () => {
  const mixedGraphics = (): MapDocument =>
    withGraphics([graphic('image-1', 0), polygon('polygon-1', 1), text('text-1', 2)]);

  it('arrayInsert usa l’indice di collezione anche con immagini, poligoni e testi', () => {
    const doc = mixedGraphics();
    const added = polygon('polygon-2', 3);
    const command = arrayInsert('graphic', [added], 1);

    const applied = run(doc, command, 'apply');

    // L'indice 1 è il secondo graphic dell'array, non la seconda immagine.
    expect(graphicsOf(applied).map((entry) => entry.id)).toEqual([
      'image-1',
      'polygon-2',
      'polygon-1',
      'text-1',
    ]);
    expect(run(applied, command, 'invert')).toEqual(doc);
  });

  it('arrayRemove rimuove un poligono e un testo per id e li ripristina', () => {
    const doc = mixedGraphics();

    const withoutPolygon = run(doc, arrayRemove('graphic', polygon('polygon-1', 1), 1), 'apply');
    expect(graphicsOf(withoutPolygon).map((entry) => entry.id))
      .toEqual(['image-1', 'text-1']);

    const withoutText = run(doc, arrayRemove('graphic', text('text-1', 2), 2), 'apply');
    expect(graphicsOf(withoutText).map((entry) => entry.id))
      .toEqual(['image-1', 'polygon-1']);
  });

  it('replaceFields aggiorna fill e opacity del poligono conservando i vertici', () => {
    const doc = mixedGraphics();
    const command = replaceFields(
      'graphic',
      'polygon-1',
      { fill: '#4ea1ff', opacity: 0.35 },
      { fill: '#ff0000', opacity: 0.8 },
    );

    const applied = run(doc, command, 'apply');
    expect(graphicsOf(applied)[1]).toMatchObject({
      id: 'polygon-1',
      points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }],
      fill: '#ff0000',
      opacity: 0.8,
    });

    expect(run(applied, command, 'invert')).toEqual(doc);
  });

  it('replaceFields aggiorna i campi del testo e torna indietro con invert', () => {
    const doc = mixedGraphics();
    const command = replaceFields(
      'graphic',
      'text-1',
      { text: 'Sala', fontSize: 24, color: '#ffffff', x: 10, y: 20, fontFamily: 'sans' },
      { text: 'Trono', fontSize: 32, color: '#ffcc00', x: 40, y: 50, fontFamily: 'serif' },
    );

    const applied = run(doc, command, 'apply');
    expect(graphicsOf(applied)[2]).toMatchObject({
      kind: 'text',
      text: 'Trono',
      fontSize: 32,
      color: '#ffcc00',
      x: 40,
      y: 50,
      fontFamily: 'serif',
    });

    expect(run(applied, command, 'invert')).toEqual(doc);
  });

  it('moveGraphicZ ordina tipi diversi per z senza mutare l’array', () => {
    const doc = mixedGraphics();
    const command = moveGraphicZ('text-1', 'bottom');

    const applied = run(doc, command, 'apply');
    expect(orderOf(applied)).toEqual(['text-1', 'image-1', 'polygon-1']);
    expect(zValues(applied)).toEqual([0, 1, 2]);

    expect(run(applied, command, 'invert')).toEqual(doc);
  });

  it('removeGraphic rimuove un poligono e l’undo lo reinserisce all’indice originale', () => {
    const doc = mixedGraphics();
    const removed = polygon('polygon-1', 1);
    const command = removeGraphic(removed, 1);

    const applied = run(doc, command, 'apply');
    expect(graphicsOf(applied).map((entry) => entry.id)).toEqual(['image-1', 'text-1']);
    expect(zValues(applied)).toEqual([0, 1]);

    expect(run(applied, command, 'invert')).toEqual(doc);
  });
});
