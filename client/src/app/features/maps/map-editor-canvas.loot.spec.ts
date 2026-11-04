import { TestBed } from '@angular/core/testing';
import type { MapLayerKind } from '@dnd-vtt/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearThemeColorsCache } from '../../core/ui/theme-colors';
import {
  flagsFor,
  mountCanvas,
  type CanvasHandle,
  type CanvasHarness,
} from './map-editor-canvas.test-helpers';
import type { EditorTool } from './map-editor-canvas.component';
import { MapEditorCanvasComponent } from './map-editor-canvas.component';

// jsdom non implementa getContext('2d'): senza mock ogni `new Konva.*` esplode.
vi.mock('konva', () => import('./map-editor-canvas.konva-mock'));

interface Pointer {
  x: number;
  y: number;
}

interface LootHarness extends CanvasHarness {
  host: () => { nativeElement: HTMLElement };
  onPointerDown(event: unknown): void;
  onPointerUp(): void;
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

interface LootMount extends CanvasHandle {
  editor: LootHarness;
  pointer: Pointer;
}

const mount = (
  tool: EditorTool,
  layerFlags?: Partial<Record<MapLayerKind, { visible: boolean; locked: boolean; opacity: number }>>,
): LootMount => {
  const handle = mountCanvas();
  const editor = handle.editor as LootHarness;
  const pointer: Pointer = { x: 0, y: 0 };
  editor.stage = fakeStage(pointer);
  editor.host = () => ({ nativeElement: document.createElement('div') });
  handle.fixture.componentRef.setInput('tool', tool);
  if (layerFlags !== undefined) {
    handle.fixture.componentRef.setInput('layerFlags', layerFlags);
  }
  return { ...handle, editor, pointer };
};

const click = (harness: LootMount, x: number, y: number): void => {
  harness.pointer.x = x;
  harness.pointer.y = y;
  harness.editor.onPointerDown({ evt: new MouseEvent('mousedown', { button: 0 }) });
  harness.editor.onPointerUp();
};

const collectLootRequests = (harness: LootMount): Array<{ x: number; y: number }> => {
  const requests: Array<{ x: number; y: number }> = [];
  harness.fixture.componentInstance.lootRequested.subscribe((event) => requests.push(event));
  return requests;
};

describe('MapEditorCanvasComponent loot', () => {
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

  it('un click con lo strumento loot emette la cella agganciata alla griglia', () => {
    const harness = mount('loot');
    const requests = collectLootRequests(harness);

    // Punto interno alla cella (2, 3) con celle da 70px e offset 0.
    click(harness, 145, 215);

    expect(requests).toEqual([{ x: 2, y: 3 }]);
    harness.fixture.destroy();
  });

  it('con un altro strumento non emette lootRequested', () => {
    const harness = mount('select');
    const requests = collectLootRequests(harness);

    click(harness, 145, 215);

    expect(requests).toEqual([]);
    harness.fixture.destroy();
  });

  it('non emette se il layer elements è bloccato', () => {
    const harness = mount('loot', flagsFor('elements', { locked: true }));
    const requests = collectLootRequests(harness);

    click(harness, 145, 215);

    expect(requests).toEqual([]);
    harness.fixture.destroy();
  });

  it('non emette se il layer elements è nascosto', () => {
    const harness = mount('loot', flagsFor('elements', { visible: false }));
    const requests = collectLootRequests(harness);

    click(harness, 145, 215);

    expect(requests).toEqual([]);
    harness.fixture.destroy();
  });
});
