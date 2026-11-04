import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  emptyMapDocument,
  type Map,
  type MapDocument,
  type MapElement,
  type MapLayerKind,
  type MapLayers,
  type WallSegment,
} from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActorService } from '../../core/services/actor.service';
import { AssetService } from '../../core/services/asset.service';
import { MapService } from '../../core/services/map.service';
import { SrdCatalogService } from '../../core/services/srd-catalog.service';
import { MapEditorPage } from './map-editor.page';

const MAP_ID = 'map-layers';

const LAYER_TOOLS: Record<MapLayerKind, readonly string[]> = {
  background: ['select'],
  graphics: ['select'],
  constraints: [
    'select',
    'wall',
    'freehand',
    'door',
    'window',
    'lowWall',
    'eraser',
    'areaRect',
    'areaPolygon',
  ],
  elements: ['select', 'light', 'spawn', 'start', 'loot'],
};

const LAYER_KINDS: readonly MapLayerKind[] = [
  'background',
  'graphics',
  'constraints',
  'elements',
];

const wall: WallSegment = {
  id: 'wall-1',
  kind: 'wall',
  a: { x: 1, y: 1 },
  b: { x: 2, y: 1 },
};

const light: MapElement = {
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

const toMap = (doc: MapDocument): Map => ({
  id: MAP_ID,
  campaignId: 'campaign-layers',
  imageAssetId: null,
  thumbAssetId: null,
  compositeAssetId: null,
  version: 1,
  createdAt: '2026-11-03T00:00:00.000Z',
  updatedAt: '2026-11-03T00:00:00.000Z',
  ...doc,
});

const patchLayer = (
  layers: MapLayers,
  kind: MapLayerKind,
  patch: { visible?: boolean; locked?: boolean; opacity?: number },
): MapLayers =>
  layers.map((layer) =>
    layer.kind === kind ? { ...layer, ...patch } : layer,
  ) as MapLayers;

const baseDocument = (): MapDocument => emptyMapDocument('Layer', null, 700, 700);

const withItems = (
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

const layerOf = (doc: MapDocument | null, kind: MapLayerKind): MapLayers[number] => {
  if (doc === null) {
    throw new Error('documento non caricato');
  }
  const layer = doc.layers.find((entry) => entry.kind === kind);
  if (layer === undefined) {
    throw new Error(`layer ${kind} assente`);
  }
  return layer;
};

const wallsOf = (doc: MapDocument | null): WallSegment[] =>
  doc === null
    ? []
    : doc.layers[2].items.filter((item): item is WallSegment => 'kind' in item);

const numberInput = (value: number): Event => {
  const input = document.createElement('input');
  input.type = 'number';
  input.value = String(value);
  return { target: input } as unknown as Event;
};

const textInput = (value: string): Event => {
  const input = document.createElement('input');
  input.value = value;
  return { target: input } as unknown as Event;
};

const toolNames = (page: MapEditorPage): string[] => {
  const names: string[] = [];
  for (const entry of page.tools()) {
    names.push(entry.tool);
  }
  return names;
};

describe('MapEditorPage layers', () => {
  const getMap = vi.fn();
  const saveMap = vi.fn();

  beforeEach(() => {
    getMap.mockReset();
    saveMap.mockReset();
    saveMap.mockResolvedValue({ version: 2 });
    TestBed.configureTestingModule({
      providers: [
        { provide: MapService, useValue: { get: getMap, save: saveMap } },
        { provide: AssetService, useValue: { upload: vi.fn(), get: vi.fn() } },
        { provide: ActorService, useValue: { listByCampaign: vi.fn().mockResolvedValue([]) } },
        {
          provide: SrdCatalogService,
          useValue: { load: () => Promise.resolve(), catalog: () => null },
        },
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

  it('parte dal layer background con la sola selezione disponibile', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;

    expect(page.activeLayer()).toBe('background');
    expect(page.activeLayerLocked()).toBe(false);
    expect(toolNames(page)).toEqual(['select']);

    fixture.destroy();
  });

  it('filtra gli strumenti della toolbar per ogni layer attivo', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;
    const root = fixture.nativeElement as HTMLElement;

    for (const kind of LAYER_KINDS) {
      page.setActiveLayer(kind);
      fixture.detectChanges();

      expect(toolNames(page)).toEqual([...LAYER_TOOLS[kind]]);
      // La toolbar mostra gli strumenti del layer più il toggle griglia.
      expect(root.querySelectorAll('.editor__tool')).toHaveLength(LAYER_TOOLS[kind].length + 1);
    }

    fixture.destroy();
  });

  it('cambiare layer forza select e azzera la selezione', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;

    page.setActiveLayer('constraints');
    page.setTool('wall');
    page.select({ type: 'wall', id: wall.id });
    expect(page.tool()).toBe('wall');
    expect(page.selected()).toEqual({ type: 'wall', id: wall.id });

    page.setActiveLayer('elements');

    expect(page.activeLayer()).toBe('elements');
    expect(page.tool()).toBe('select');
    expect(page.selected()).toBeNull();

    fixture.destroy();
  });

  it('rifiuta gli strumenti non pertinenti al layer attivo', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;

    page.setTool('wall');
    expect(page.tool()).toBe('select');

    page.setActiveLayer('constraints');
    page.setTool('light');
    expect(page.tool()).toBe('select');
    page.setTool('wall');
    expect(page.tool()).toBe('wall');

    page.setActiveLayer('elements');
    page.setTool('wall');
    expect(page.tool()).toBe('select');
    page.setTool('light');
    expect(page.tool()).toBe('light');

    fixture.destroy();
  });

  it('activeLayerLocked segue il lock del layer attivo', async () => {
    const base = baseDocument();
    const doc = {
      ...base,
      layers: patchLayer(base.layers, 'constraints', { locked: true }),
    };
    const fixture = await render(doc);
    const page = fixture.componentInstance;

    expect(page.activeLayerLocked()).toBe(false);
    page.setActiveLayer('constraints');
    expect(page.activeLayerLocked()).toBe(true);
    page.setActiveLayer('graphics');
    expect(page.activeLayerLocked()).toBe(false);

    fixture.destroy();
  });

  it('un layer bloccato blocca nuove modifiche ma non i controlli del layer', async () => {
    const locked = patchLayer(baseDocument().layers, 'constraints', { locked: true });
    const doc = withItems({ ...baseDocument(), layers: locked }, [wall], []);
    const fixture = await render(doc);
    const page = fixture.componentInstance;
    page.setActiveLayer('constraints');
    const before = structuredClone(page.doc());

    page.onWallsDrawn({
      walls: [{ id: 'wall-2', kind: 'wall', a: { x: 0, y: 0 }, b: { x: 0, y: 1 } }],
    });
    page.moveWall({ id: wall.id, dx: 1, dy: 0 });
    page.placeLight({ x: 3, y: 3 });
    page.placeStart({ x: 3, y: 3 });
    expect(page.doc()).toEqual(before);

    page.setLayerVisible('constraints', false);
    expect(layerOf(page.doc(), 'constraints').visible).toBe(false);
    expect(page.dirty()).toBe(true);

    page.toggleLayerLock('constraints');
    expect(layerOf(page.doc(), 'constraints').locked).toBe(false);
    page.moveWall({ id: wall.id, dx: 1, dy: 0 });
    expect(wallsOf(page.doc())[0]?.a).toEqual({ x: 2, y: 1 });

    fixture.destroy();
  });

  it('un layer elements bloccato blocca move e campi dell’elemento', async () => {
    const locked = patchLayer(baseDocument().layers, 'elements', { locked: true });
    const doc = withItems({ ...baseDocument(), layers: locked }, [], [light]);
    const fixture = await render(doc);
    const page = fixture.componentInstance;
    page.setActiveLayer('elements');
    page.select({ type: 'light', id: light.id });
    const before = structuredClone(page.doc());

    page.updateLightField('brightFeet', numberInput(30));
    page.moveElement({ selection: { type: 'light', id: light.id }, cell: { x: 4, y: 4 } });

    expect(page.doc()).toEqual(before);

    fixture.destroy();
  });

  it('visible, lock e opacità passano dalla history con undo e redo', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;

    page.setLayerVisible('graphics', false);
    expect(layerOf(page.doc(), 'graphics').visible).toBe(false);
    expect(page.dirty()).toBe(true);

    page.toggleLayerLock('elements');
    expect(layerOf(page.doc(), 'elements').locked).toBe(true);

    page.commitLayerOpacity('background', numberInput(0.35));
    expect(layerOf(page.doc(), 'background').opacity).toBeCloseTo(0.35, 5);

    page.undo();
    expect(layerOf(page.doc(), 'background').opacity).toBe(1);
    page.undo();
    expect(layerOf(page.doc(), 'elements').locked).toBe(false);
    page.undo();
    expect(layerOf(page.doc(), 'graphics').visible).toBe(true);

    page.redo();
    expect(layerOf(page.doc(), 'graphics').visible).toBe(false);
    page.redo();
    expect(layerOf(page.doc(), 'elements').locked).toBe(true);
    page.redo();
    expect(layerOf(page.doc(), 'background').opacity).toBeCloseTo(0.35, 5);

    fixture.destroy();
  });

  it('limita l’opacità a 0..1 e ignora i valori non numerici', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;

    page.commitLayerOpacity('graphics', numberInput(2));
    expect(layerOf(page.doc(), 'graphics').opacity).toBe(1);

    page.commitLayerOpacity('graphics', numberInput(-1));
    expect(layerOf(page.doc(), 'graphics').opacity).toBe(0);

    const before = structuredClone(page.doc());
    page.commitLayerOpacity('graphics', textInput('abc'));
    expect(page.doc()).toEqual(before);

    fixture.destroy();
  });

  it('mantiene il filtro della toolbar dopo undo e redo', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;
    page.setActiveLayer('elements');
    page.toggleLayerLock('elements');

    page.undo();
    fixture.detectChanges();
    expect(page.activeLayer()).toBe('elements');
    expect(page.activeLayerLocked()).toBe(false);
    expect(toolNames(page)).toEqual([...LAYER_TOOLS.elements]);

    page.redo();
    fixture.detectChanges();
    expect(page.activeLayer()).toBe('elements');
    expect(page.activeLayerLocked()).toBe(true);
    expect(page.tool()).toBe('select');
    expect(toolNames(page)).toEqual([...LAYER_TOOLS.elements]);

    fixture.destroy();
  });

  it('conserva visible, locked e opacity dei quattro layer nel documento', async () => {
    let layers = patchLayer(baseDocument().layers, 'background', { visible: false });
    layers = patchLayer(layers, 'constraints', { locked: true });
    layers = patchLayer(layers, 'elements', { opacity: 0.4 });
    const fixture = await render({ ...baseDocument(), layers });
    const doc = fixture.componentInstance.doc() as MapDocument;

    expect(doc.layers[0]).toMatchObject({ visible: false, locked: false, opacity: 1 });
    expect(doc.layers[2]).toMatchObject({ visible: true, locked: true, opacity: 1 });
    expect(doc.layers[3]).toMatchObject({ visible: true, locked: false, opacity: 0.4 });
    expect(doc.layers.map((layer) => layer.kind))
      .toEqual(['background', 'graphics', 'constraints', 'elements']);

    fixture.destroy();
  });

  it('salva i quattro layer con il loro stato corrente', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;
    page.setLayerVisible('graphics', false);

    await page.save();

    const saved = saveMap.mock.calls[0]?.[2] as MapDocument;
    expect(saved.layers.map((layer) => [layer.kind, layer.visible, layer.locked, layer.opacity]))
      .toEqual([
        ['background', true, false, 1],
        ['graphics', false, false, 1],
        ['constraints', true, false, 1],
        ['elements', true, false, 1],
      ]);

    fixture.destroy();
  });

  it('collega il pannello layer: attiva e commuta visibilità e lock', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;
    const root = fixture.nativeElement as HTMLElement;
    const row = (kind: MapLayerKind): HTMLElement => {
      const element = root.querySelector<HTMLElement>(`.layer-panel__row[data-kind="${kind}"]`);
      if (element === null) {
        throw new Error(`riga layer ${kind} assente`);
      }
      return element;
    };

    row('constraints').click();
    fixture.detectChanges();
    expect(page.activeLayer()).toBe('constraints');
    expect(root.querySelectorAll('.editor__tool')).toHaveLength(
      LAYER_TOOLS.constraints.length + 1,
    );

    const eye = row('constraints').querySelector<HTMLButtonElement>('.layer-panel__visibility');
    eye?.click();
    fixture.detectChanges();
    expect(layerOf(page.doc(), 'constraints').visible).toBe(false);

    const lock = row('constraints').querySelector<HTMLButtonElement>('.layer-panel__lock');
    lock?.click();
    fixture.detectChanges();
    expect(layerOf(page.doc(), 'constraints').locked).toBe(true);
    expect(page.dirty()).toBe(true);

    fixture.destroy();
  });
});
