import { TestBed } from '@angular/core/testing';
import type { MeasureResult } from '@dnd-vtt/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clampBrushCells,
  clampFogSoftness,
  clampPencilTenths,
  DEFAULT_BRUSH_CELLS,
  DEFAULT_PENCIL_TENTHS,
  FOG_SNAP_KEY,
  MAP_TOOL_SIZES_KEY,
  SceneToolsStore,
} from './scene-tools.store';

const measure = (): MeasureResult => ({
  from: { x: 0, y: 0 },
  to: { x: 2, y: 0 },
  cells: 2,
  feet: 10,
});

describe('SceneToolsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('parte dai default senza preferenze salvate', () => {
    const store = TestBed.inject(SceneToolsStore);

    expect(store.tool()).toBe('select');
    expect(store.gridVisible()).toBe(true);
    expect(store.fogSoftness()).toBe(0);
    expect(store.fogBrushCells()).toBe(DEFAULT_BRUSH_CELLS);
    expect(store.pencilTenths()).toBe(DEFAULT_PENCIL_TENTHS);
    expect(store.fogSnap()).toBe(true);
    expect(store.measure()).toBeNull();
  });

  it('limita i valori fuori scala e ricade sui default', () => {
    expect(clampBrushCells(99)).toBe(20);
    expect(clampBrushCells(0)).toBe(0.5);
    expect(clampBrushCells(Number.NaN)).toBe(DEFAULT_BRUSH_CELLS);
    expect(clampPencilTenths(99)).toBe(10);
    expect(clampPencilTenths(0)).toBe(0.5);
    expect(clampPencilTenths(Number.NaN)).toBe(DEFAULT_PENCIL_TENTHS);
    expect(clampFogSoftness(999)).toBe(200);
    expect(clampFogSoftness(-5)).toBe(0);
    expect(clampFogSoftness(Number.NaN)).toBe(0);
  });

  it('cambia tool e griglia, azzerando la misura fuori dalla modalità misura', () => {
    const store = TestBed.inject(SceneToolsStore);

    store.setTool('measure');
    store.setMeasure(measure());
    expect(store.measure()?.feet).toBe(10);

    store.setTool('fog-reveal');
    expect(store.tool()).toBe('fog-reveal');
    expect(store.measure()).toBeNull();

    store.setTool('measure');
    store.setMeasure(measure());
    store.setTool('measure');
    expect(store.measure()?.feet).toBe(10);

    store.toggleGrid();
    expect(store.gridVisible()).toBe(false);
    store.toggleGrid();
    expect(store.gridVisible()).toBe(true);
  });

  it('persiste dimensioni di pennello e matita', () => {
    const store = TestBed.inject(SceneToolsStore);

    store.setBrushCells(4.5);
    store.setPencilTenths(1.5);

    expect(store.fogBrushCells()).toBe(4.5);
    expect(store.pencilTenths()).toBe(1.5);
    expect(JSON.parse(localStorage.getItem(MAP_TOOL_SIZES_KEY) ?? 'null')).toEqual({
      brushCells: 4.5,
      pencilTenths: 1.5,
    });

    store.setBrushCells(50);
    expect(store.fogBrushCells()).toBe(20);
    expect(JSON.parse(localStorage.getItem(MAP_TOOL_SIZES_KEY) ?? 'null')).toEqual({
      brushCells: 20,
      pencilTenths: 1.5,
    });
  });

  it('persiste il fog a celle e ripristina le preferenze alla creazione', () => {
    const first = TestBed.inject(SceneToolsStore);
    first.setFogSnap(false);
    expect(localStorage.getItem(FOG_SNAP_KEY)).toBe('false');

    localStorage.setItem(MAP_TOOL_SIZES_KEY, JSON.stringify({
      brushCells: 6,
      pencilTenths: 3,
    }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    const restored = TestBed.inject(SceneToolsStore);
    expect(restored.fogBrushCells()).toBe(6);
    expect(restored.pencilTenths()).toBe(3);
    expect(restored.fogSnap()).toBe(false);
  });

  it('azzera lo stato volatile senza toccare le dimensioni persistite', () => {
    const store = TestBed.inject(SceneToolsStore);
    store.setTool('draw');
    store.setMeasure(measure());
    store.toggleGrid();
    store.setBrushCells(6);
    store.setPencilTenths(3);
    store.setFogSnap(false);

    store.resetVolatile();

    expect(store.tool()).toBe('select');
    expect(store.gridVisible()).toBe(true);
    expect(store.measure()).toBeNull();
    expect(store.fogBrushCells()).toBe(6);
    expect(store.pencilTenths()).toBe(3);
    expect(store.fogSnap()).toBe(false);
  });

  it('ignora preferenze corrotte o fuori scala', () => {
    localStorage.setItem(MAP_TOOL_SIZES_KEY, '{non-json');
    expect(TestBed.inject(SceneToolsStore).fogBrushCells()).toBe(DEFAULT_BRUSH_CELLS);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    localStorage.setItem(MAP_TOOL_SIZES_KEY, JSON.stringify({
      brushCells: 99,
      pencilTenths: 'x',
    }));

    const store = TestBed.inject(SceneToolsStore);
    expect(store.fogBrushCells()).toBe(20);
    expect(store.pencilTenths()).toBe(DEFAULT_PENCIL_TENTHS);
  });
});
