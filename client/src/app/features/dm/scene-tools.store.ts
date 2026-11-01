import { FOG_BRUSH_CELLS, type MeasureResult } from '@dnd-vtt/shared';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import type { SceneTool } from '../scene/scene-canvas.component';

export const MAP_TOOL_SIZES_KEY = 'dnd-vtt.map-tool-sizes';
export const FOG_SNAP_KEY = 'dnd-vtt.fog-snap';
export const DEFAULT_BRUSH_CELLS = FOG_BRUSH_CELLS;
export const DEFAULT_PENCIL_TENTHS = 2.5;
export const DEFAULT_FOG_SOFTNESS = 0;

const MIN_BRUSH_CELLS = 0.5;
const MAX_BRUSH_CELLS = 20;
const MIN_PENCIL_TENTHS = 0.5;
const MAX_PENCIL_TENTHS = 10;
const MAX_FOG_SOFTNESS = 200;

export interface SceneToolsState {
  tool: SceneTool;
  gridVisible: boolean;
  fogSoftness: number;
  fogBrushCells: number;
  pencilTenths: number;
  fogSnap: boolean;
  measure: MeasureResult | null;
}

interface StoredToolSizes {
  brushCells: number;
  pencilTenths: number;
}

/** Diametro del pennello/gomma fog in celle: valori fuori scala tornano al default. */
export const clampBrushCells = (value: number): number =>
  Number.isFinite(value)
    ? Math.max(MIN_BRUSH_CELLS, Math.min(MAX_BRUSH_CELLS, value))
    : DEFAULT_BRUSH_CELLS;

/** Spessore della matita in decimi di cella: valori fuori scala tornano al default. */
export const clampPencilTenths = (value: number): number =>
  Number.isFinite(value)
    ? Math.max(MIN_PENCIL_TENTHS, Math.min(MAX_PENCIL_TENTHS, value))
    : DEFAULT_PENCIL_TENTHS;

/** Morbidezza del bordo fog in pixel: valori fuori scala tornano a zero. */
export const clampFogSoftness = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(MAX_FOG_SOFTNESS, value)) : DEFAULT_FOG_SOFTNESS;

const readToolSizes = (): StoredToolSizes => {
  try {
    const raw = localStorage.getItem(MAP_TOOL_SIZES_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as Partial<StoredToolSizes>;
      return {
        brushCells: clampBrushCells(Number(parsed.brushCells)),
        pencilTenths: clampPencilTenths(Number(parsed.pencilTenths)),
      };
    }
  } catch {
    // localStorage può essere disabilitato: si usano i default.
  }
  return { brushCells: DEFAULT_BRUSH_CELLS, pencilTenths: DEFAULT_PENCIL_TENTHS };
};

const readFogSnap = (): boolean => {
  try {
    return localStorage.getItem(FOG_SNAP_KEY) !== 'false';
  } catch {
    return true;
  }
};

const persistToolSizes = (sizes: StoredToolSizes): void => {
  try {
    localStorage.setItem(MAP_TOOL_SIZES_KEY, JSON.stringify(sizes));
  } catch {
    // La preferenza resta valida per la sessione.
  }
};

const persistFogSnap = (enabled: boolean): void => {
  try {
    localStorage.setItem(FOG_SNAP_KEY, String(enabled));
  } catch {
    // localStorage può essere disabilitato: la scelta vale per la sessione.
  }
};

/** Stato iniziale: le preferenze persistite sono lette alla creazione dello store. */
export const initialSceneTools = (): SceneToolsState => {
  const sizes = readToolSizes();
  return {
    tool: 'select',
    gridVisible: true,
    fogSoftness: DEFAULT_FOG_SOFTNESS,
    fogBrushCells: sizes.brushCells,
    pencilTenths: sizes.pencilTenths,
    fogSnap: readFogSnap(),
    measure: null,
  };
};

/**
 * Preferenze degli strumenti di scena della console DM: tool attivo, griglia,
 * pennello/gomma fog, matita e modalità misura. La persistenza riguarda solo
 * le preferenze già salvate prima dello split (`dnd-vtt.map-tool-sizes`,
 * `dnd-vtt.fog-snap`); il tool attivo resta per sessione.
 */
export const SceneToolsStore = signalStore(
  { providedIn: 'root' },
  withState(initialSceneTools),
  withMethods((store) => ({
    /** Cambiare strumento azzera la misura quando si esce dalla modalità misura. */
    setTool(tool: SceneTool): void {
      patchState(store, tool === 'measure' ? { tool } : { tool, measure: null });
    },

    /**
     * Riporta allo stato iniziale i valori non persistiti (tool, griglia e
     * misura). Usato all'avvio della console e al cambio campagna, così lo
     * store root non conserva lo stato volatile tra sessioni diverse.
     */
    resetVolatile(): void {
      patchState(store, { tool: 'select', gridVisible: true, measure: null });
    },

    toggleGrid(): void {
      patchState(store, { gridVisible: !store.gridVisible() });
    },

    setFogSoftness(value: number): void {
      patchState(store, { fogSoftness: clampFogSoftness(value) });
    },

    setBrushCells(value: number): void {
      patchState(store, { fogBrushCells: clampBrushCells(value) });
      persistToolSizes({
        brushCells: store.fogBrushCells(),
        pencilTenths: store.pencilTenths(),
      });
    },

    setPencilTenths(value: number): void {
      patchState(store, { pencilTenths: clampPencilTenths(value) });
      persistToolSizes({
        brushCells: store.fogBrushCells(),
        pencilTenths: store.pencilTenths(),
      });
    },

    setFogSnap(enabled: boolean): void {
      patchState(store, { fogSnap: enabled });
      persistFogSnap(enabled);
    },

    setMeasure(measure: MeasureResult | null): void {
      patchState(store, { measure });
    },
  })),
);
