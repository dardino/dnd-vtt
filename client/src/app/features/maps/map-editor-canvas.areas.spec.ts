import { TestBed } from '@angular/core/testing';
import {
  defaultGridConfig,
  type BlockedArea,
  type GridConfig,
  type MapLayerKind,
} from '@dnd-vtt/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearThemeColorsCache } from '../../core/ui/theme-colors';
import {
  flagsFor,
  mountCanvas,
  type CanvasHandle,
  type CanvasHarness,
} from './map-editor-canvas.test-helpers';
import type { EditorSelection as CanvasSelection, EditorTool } from './map-editor-canvas.component';
import { MapEditorCanvasComponent } from './map-editor-canvas.component';

// jsdom non implementa getContext('2d'): senza mock ogni `new Konva.*` esplode.
vi.mock('konva', () => import('./map-editor-canvas.konva-mock'));

/** Superficie interna usata dai test di interazione, come negli spec grafiche. */
interface AreaHarness extends CanvasHarness {
  host: () => { nativeElement: HTMLElement };
  onPointerDown(event: unknown): void;
  onPointerMove(event: unknown): void;
  onPointerUp(): void;
  onKeyDown(event: KeyboardEvent): void;
}

interface Pointer {
  x: number;
  y: number;
}

interface MutableStage {
  width: () => number;
  height: () => number;
  scaleX: () => number;
  scaleY: () => number;
  scale: () => void;
  position: () => void;
  x: () => number;
  y: () => number;
  getPointerPosition: () => Pointer;
  destroy: () => void;
}

const fakeStage = (pointer: Pointer): MutableStage => ({
  width: () => 100,
  height: () => 100,
  scaleX: () => 1,
  scaleY: () => 1,
  scale: () => {},
  position: () => {},
  x: () => 0,
  y: () => 0,
  getPointerPosition: () => pointer,
  destroy: () => {},
});

const rectArea: BlockedArea = {
  id: 'area-rect',
  shape: 'rect',
  points: [{ x: 1, y: 1 }, { x: 3, y: 2 }],
};

const polygonArea: BlockedArea = {
  id: 'area-polygon',
  shape: 'polygon',
  points: [{ x: 5, y: 5 }, { x: 7, y: 5 }, { x: 7, y: 7 }],
};

const hexGrid: GridConfig = { ...defaultGridConfig, type: 'hex' };

interface AreaMount extends CanvasHandle {
  editor: AreaHarness;
  pointer: Pointer;
}

const mount = (
  tool: EditorTool,
  options: {
    blockedAreas?: BlockedArea[];
    layerFlags?: Partial<Record<MapLayerKind, { visible: boolean; locked: boolean; opacity: number }>>;
    grid?: GridConfig;
  } = {},
): AreaMount => {
  const handle = mountCanvas();
  const editor = handle.editor as AreaHarness;
  const pointer: Pointer = { x: 0, y: 0 };
  editor.stage = fakeStage(pointer);
  editor.host = () => ({ nativeElement: document.createElement('div') });
  handle.fixture.componentRef.setInput('tool', tool);
  handle.fixture.componentRef.setInput('blockedAreas', options.blockedAreas ?? []);
  if (options.layerFlags !== undefined) {
    handle.fixture.componentRef.setInput('layerFlags', options.layerFlags);
  }
  if (options.grid !== undefined) {
    handle.fixture.componentRef.setInput('grid', options.grid);
  }
  return { ...handle, editor, pointer };
};

const mouseDown = (harness: AreaMount, x: number, y: number, detail = 1): void => {
  harness.pointer.x = x;
  harness.pointer.y = y;
  harness.editor.onPointerDown({
    evt: new MouseEvent('mousedown', { button: 0, detail }),
  });
};

const mouseMove = (harness: AreaMount, x: number, y: number): void => {
  harness.pointer.x = x;
  harness.pointer.y = y;
  harness.editor.onPointerMove({ evt: new MouseEvent('mousemove') });
};

const mouseUp = (harness: AreaMount): void => harness.editor.onPointerUp();

const click = (harness: AreaMount, x: number, y: number, detail = 1): void => {
  mouseDown(harness, x, y, detail);
  mouseUp(harness);
};

const key = (harness: AreaMount, value: string): void => {
  harness.editor.onKeyDown(new KeyboardEvent('keydown', { key: value }));
};

interface DrawnArea {
  shape: 'rect' | 'polygon';
  points: Array<{ x: number; y: number }>;
}

const collectDrawn = (harness: AreaMount): DrawnArea[] => {
  const drawn: DrawnArea[] = [];
  harness.fixture.componentInstance.areaDrawn.subscribe((event) => drawn.push(event));
  return drawn;
};

const collectSelections = (harness: AreaMount): Array<CanvasSelection | null> => {
  const selected: Array<CanvasSelection | null> = [];
  harness.fixture.componentInstance.elementSelected.subscribe((event) => selected.push(event));
  return selected;
};

const collectRemoved = (harness: AreaMount): Array<{ id: string }> => {
  const removed: Array<{ id: string }> = [];
  harness.fixture.componentInstance.areaRemoved.subscribe((event) => removed.push(event));
  return removed;
};

/** Centro in pixel mappa di una cella di griglia (cella 70px, offset 0). */
const cellCenter = (x: number, y: number): [number, number] => [x * 70 + 35, y * 70 + 35];

describe('MapEditorCanvasComponent aree bloccate', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      public observe(): void {} public unobserve(): void {} public disconnect(): void {}
    });
    TestBed.configureTestingModule({ imports: [MapEditorCanvasComponent] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearThemeColorsCache();
  });

  describe('rettangolo', () => {
    it('emette i due angoli normalizzati al pointerup', () => {
      const harness = mount('areaRect');
      const drawn = collectDrawn(harness);

      mouseDown(harness, 70, 70);
      mouseMove(harness, 210, 140);
      mouseUp(harness);

      expect(drawn).toEqual([{
        shape: 'rect',
        points: [{ x: 1, y: 1 }, { x: 3, y: 2 }],
      }]);
      harness.fixture.destroy();
    });

    it('normalizza un drag in direzione opposta in min/max', () => {
      const harness = mount('areaRect');
      const drawn = collectDrawn(harness);

      mouseDown(harness, 210, 140);
      mouseMove(harness, 70, 70);
      mouseUp(harness);

      expect(drawn).toEqual([{
        shape: 'rect',
        points: [{ x: 1, y: 1 }, { x: 3, y: 2 }],
      }]);
      harness.fixture.destroy();
    });

    it('aggancia i vertici al reticolo più vicino', () => {
      const harness = mount('areaRect');
      const drawn = collectDrawn(harness);

      mouseDown(harness, 68, 73);
      mouseMove(harness, 212, 142);
      mouseUp(harness);

      expect(drawn[0]?.points).toEqual([{ x: 1, y: 1 }, { x: 3, y: 2 }]);
      harness.fixture.destroy();
    });

    it('non emette un rettangolo degenere', () => {
      const harness = mount('areaRect');
      const drawn = collectDrawn(harness);

      mouseDown(harness, 140, 140);
      mouseMove(harness, 140, 280);
      mouseUp(harness);

      expect(drawn).toEqual([]);
      harness.fixture.destroy();
    });

    it('non emette nulla prima del pointerup', () => {
      const harness = mount('areaRect');
      const drawn = collectDrawn(harness);

      mouseDown(harness, 70, 70);
      mouseMove(harness, 210, 140);

      expect(drawn).toEqual([]);
      harness.fixture.destroy();
    });
  });

  describe('poligono', () => {
    it('aggiunge vertici snapped e chiude con Enter', () => {
      const harness = mount('areaPolygon');
      const drawn = collectDrawn(harness);

      click(harness, 68, 73);
      click(harness, 212, 73);
      click(harness, 212, 142);
      key(harness, 'Enter');

      expect(drawn).toEqual([{
        shape: 'polygon',
        points: [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 2 }],
      }]);
      harness.fixture.destroy();
    });

    it('chiude con un doppio click sull’ultimo vertice', () => {
      const harness = mount('areaPolygon');
      const drawn = collectDrawn(harness);

      click(harness, 70, 70);
      click(harness, 210, 70);
      click(harness, 210, 140);
      mouseDown(harness, 210, 140, 2);
      mouseUp(harness);

      expect(drawn).toEqual([{
        shape: 'polygon',
        points: [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 2 }],
      }]);
      harness.fixture.destroy();
    });

    it('ignora i vertici consecutivi duplicati', () => {
      const harness = mount('areaPolygon');
      const drawn = collectDrawn(harness);

      click(harness, 70, 70);
      click(harness, 70, 70);
      click(harness, 210, 70);
      click(harness, 210, 140);
      key(harness, 'Enter');

      expect(drawn).toEqual([{
        shape: 'polygon',
        points: [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 2 }],
      }]);
      harness.fixture.destroy();
    });

    it('con meno di tre vertici non crea nulla', () => {
      const harness = mount('areaPolygon');
      const drawn = collectDrawn(harness);

      click(harness, 70, 70);
      click(harness, 210, 70);
      key(harness, 'Enter');

      expect(drawn).toEqual([]);
      harness.fixture.destroy();
    });

    it('non emette un poligono con tre vertici collineari', () => {
      const harness = mount('areaPolygon');
      const drawn = collectDrawn(harness);

      click(harness, 70, 70);
      click(harness, 140, 70);
      click(harness, 210, 70);
      key(harness, 'Enter');

      expect(drawn).toEqual([]);
      harness.fixture.destroy();
    });

    it('Esc annulla il poligono in corso', () => {
      const harness = mount('areaPolygon');
      const drawn = collectDrawn(harness);

      click(harness, 70, 70);
      click(harness, 210, 70);
      click(harness, 210, 140);
      key(harness, 'Escape');
      key(harness, 'Enter');

      expect(drawn).toEqual([]);
      harness.fixture.destroy();
    });

    it('disegna l’anteprima in overlay senza emettere prima della chiusura', () => {
      const harness = mount('areaPolygon');
      const drawn = collectDrawn(harness);

      click(harness, 70, 70);
      click(harness, 210, 70);

      expect(harness.layers.overlay.children.length).toBeGreaterThan(0);
      expect(drawn).toEqual([]);
      harness.fixture.destroy();
    });
  });

  describe('selezione', () => {
    it('seleziona l’area rettangolare cliccata al centro', () => {
      const harness = mount('select', { blockedAreas: [rectArea, polygonArea] });
      const selected = collectSelections(harness);
      harness.editor.renderAll();

      const [x, y] = cellCenter(2, 1.5);
      click(harness, x, y);

      expect(selected).toEqual([{ type: 'area', id: rectArea.id }]);
      harness.fixture.destroy();
    });

    it('seleziona l’area poligonale cliccata al centro', () => {
      const harness = mount('select', { blockedAreas: [polygonArea] });
      const selected = collectSelections(harness);
      harness.editor.renderAll();

      const [x, y] = cellCenter(6, 6);
      click(harness, x, y);

      expect(selected).toEqual([{ type: 'area', id: polygonArea.id }]);
      harness.fixture.destroy();
    });

    it('un click fuori dalle aree non seleziona nulla', () => {
      const harness = mount('select', { blockedAreas: [rectArea] });
      const selected = collectSelections(harness);
      harness.editor.renderAll();

      click(harness, 10, 10);

      expect(selected).toEqual([null]);
      harness.fixture.destroy();
    });

    it('non seleziona aree con layer constraints bloccato o invisibile', () => {
      const locked = mount('select', {
        blockedAreas: [rectArea],
        layerFlags: flagsFor('constraints', { locked: true }),
      });
      const lockedSelected = collectSelections(locked);
      locked.editor.renderAll();
      click(locked, ...cellCenter(2, 1.5));
      expect(lockedSelected).toEqual([null]);
      locked.fixture.destroy();

      const hidden = mount('select', {
        blockedAreas: [rectArea],
        layerFlags: flagsFor('constraints', { visible: false }),
      });
      const hiddenSelected = collectSelections(hidden);
      hidden.editor.renderAll();
      click(hidden, ...cellCenter(2, 1.5));
      expect(hiddenSelected).toEqual([null]);
      hidden.fixture.destroy();
    });

    it('con uno strumento di disegno non seleziona le aree', () => {
      const harness = mount('areaRect', { blockedAreas: [rectArea] });
      const selected = collectSelections(harness);
      harness.editor.renderAll();

      click(harness, ...cellCenter(2, 1.5));

      expect(selected).toEqual([]);
      harness.fixture.destroy();
    });
  });

  describe('gomma', () => {
    it('un click su un’area emette areaRemoved una sola volta', () => {
      const harness = mount('eraser', { blockedAreas: [rectArea] });
      const removed = collectRemoved(harness);
      harness.editor.renderAll();

      click(harness, ...cellCenter(2, 1.5));

      expect(removed).toEqual([{ id: rectArea.id }]);
      harness.fixture.destroy();
    });

    it('un trascinamento rimuove ogni area attraversata una sola volta', () => {
      const harness = mount('eraser', { blockedAreas: [rectArea, polygonArea] });
      const removed = collectRemoved(harness);
      harness.editor.renderAll();

      mouseDown(harness, ...cellCenter(2, 1.5));
      mouseMove(harness, ...cellCenter(2, 1.5));
      mouseMove(harness, ...cellCenter(6, 6));
      mouseMove(harness, ...cellCenter(6, 6));
      mouseUp(harness);

      expect(removed).toEqual([{ id: rectArea.id }, { id: polygonArea.id }]);
      harness.fixture.destroy();
    });

    it('non rimuove aree con layer constraints bloccato o invisibile', () => {
      const locked = mount('eraser', {
        blockedAreas: [rectArea],
        layerFlags: flagsFor('constraints', { locked: true }),
      });
      const lockedRemoved = collectRemoved(locked);
      locked.editor.renderAll();
      click(locked, ...cellCenter(2, 1.5));
      expect(lockedRemoved).toEqual([]);
      locked.fixture.destroy();

      const hidden = mount('eraser', {
        blockedAreas: [rectArea],
        layerFlags: flagsFor('constraints', { visible: false }),
      });
      const hiddenRemoved = collectRemoved(hidden);
      hidden.editor.renderAll();
      click(hidden, ...cellCenter(2, 1.5));
      expect(hiddenRemoved).toEqual([]);
      hidden.fixture.destroy();
    });
  });

  describe('griglia esagonale', () => {
    it('non seleziona un’area già presente', () => {
      const harness = mount('select', { blockedAreas: [rectArea], grid: hexGrid });
      const selected = collectSelections(harness);
      harness.editor.renderAll();

      click(harness, ...cellCenter(2, 1.5));

      expect(selected).toEqual([null]);
      harness.fixture.destroy();
    });

    it('la gomma non cancella un’area già presente', () => {
      const harness = mount('eraser', { blockedAreas: [rectArea], grid: hexGrid });
      const removed = collectRemoved(harness);
      harness.editor.renderAll();

      click(harness, ...cellCenter(2, 1.5));

      expect(removed).toEqual([]);
      harness.fixture.destroy();
    });
  });
});
