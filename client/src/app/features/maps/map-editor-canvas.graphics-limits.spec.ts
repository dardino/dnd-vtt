import { TestBed } from '@angular/core/testing';
import type { CellPoint } from '@dnd-vtt/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapEditorCanvasComponent } from './map-editor-canvas.component';
import {
  collect,
  keyDown,
  mountShapes,
  outputsOf,
  pointerDown,
  type Harness,
} from './map-editor-canvas.shapes-helper.spec';

vi.mock('konva', () => import('./map-editor-canvas.konva-mock'));

const CELL_SIZE = 70;

/** Perimetro della griglia 10x10: 36 celle consecutive con area non nulla. */
const PERIMETER: readonly CellPoint[] = [
  ...Array.from({ length: 10 }, (_, x) => ({ x, y: 0 })),
  ...Array.from({ length: 9 }, (_, index) => ({ x: 9, y: index + 1 })),
  ...Array.from({ length: 9 }, (_, index) => ({ x: 8 - index, y: 9 })),
  ...Array.from({ length: 8 }, (_, index) => ({ x: 0, y: 8 - index })),
];

/** Ripete il perimetro: ogni punto differisce dal precedente, anche nel giro. */
const draftCells = (count: number): CellPoint[] =>
  Array.from({ length: count }, (_, index) => PERIMETER[index % PERIMETER.length]!);

const clickCell = (harness: Harness, cell: CellPoint): void => {
  pointerDown(harness, cell.x * CELL_SIZE + 10, cell.y * CELL_SIZE + 10);
};

describe('MapEditorCanvasComponent limite vertici del poligono grafico', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      public observe(): void {} public unobserve(): void {} public disconnect(): void {}
    });
    TestBed.configureTestingModule({ imports: [MapEditorCanvasComponent] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('dopo 200 vertici ignora il 201° click e chiude con 200 punti', () => {
    const harness = mountShapes({ tool: 'graphicPolygon' });
    const drawn = collect(outputsOf(harness.fixture.componentInstance).graphicPolygonDrawn);
    const cells = draftCells(200);

    for (const cell of cells) {
      clickCell(harness, cell);
    }
    // Il 201° click è su una cella diversa dall'ultima: senza limite verrebbe
    // aggiunto e la chiusura emetterebbe 201 vertici.
    clickCell(harness, { x: 0, y: 9 });
    keyDown(harness, 'Enter');

    expect(drawn).toHaveLength(1);
    expect(drawn[0]?.points).toHaveLength(200);
    expect(drawn[0]?.points).toEqual(cells);

    harness.fixture.destroy();
  });

  it('con esattamente 200 vertici chiude ed emette il poligono', () => {
    const harness = mountShapes({ tool: 'graphicPolygon' });
    const drawn = collect(outputsOf(harness.fixture.componentInstance).graphicPolygonDrawn);
    const cells = draftCells(200);

    for (const cell of cells) {
      clickCell(harness, cell);
    }
    keyDown(harness, 'Enter');

    expect(drawn).toHaveLength(1);
    expect(drawn[0]?.points).toEqual(cells);

    harness.fixture.destroy();
  });
});
