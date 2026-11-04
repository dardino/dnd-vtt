import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  defaultGridConfig,
  type MapLayerKind,
  type MapSpawn,
  type PlayerStart,
  type Terrain,
  type WallSegment,
} from '@dnd-vtt/shared';
import { MapEditorCanvasComponent } from './map-editor-canvas.component';

/** Nodo Konva finto: espone config/attrs e figli per le asserzioni. */
export interface ShapeLike {
  getAttr: (name: string) => unknown;
  getChildren: () => ShapeLike[];
}

/** Stato di un layer logico, come lo passa la pagina al canvas. */
export interface LayerFlag {
  visible: boolean;
  locked: boolean;
  opacity: number;
}

export type LayerFlags = Partial<Record<MapLayerKind, LayerFlag>>;

/**
 * Layer Konva finto: conta `add`/`draw` così i test di lifecycle possono
 * verificare che un render tardivo non tocchi più la scena.
 */
export class FakeLayer {
  public readonly children: ShapeLike[] = [];
  public listeningValue: boolean | null = null;
  public opacityValue: number | null = null;
  public visibleValue: boolean | null = null;
  public addCount = 0;
  public drawCount = 0;

  public add(node: ShapeLike): void {
    this.addCount += 1;
    this.children.push(node);
  }

  public destroyChildren(): void {
    this.children.length = 0;
  }

  public draw(): void {
    this.drawCount += 1;
  }

  public listening(value?: boolean): void {
    if (value !== undefined) {
      this.listeningValue = value;
    }
  }

  public opacity(value?: number): void {
    if (value !== undefined) {
      this.opacityValue = value;
    }
  }

  public visible(value?: boolean): void {
    if (value !== undefined) {
      this.visibleValue = value;
    }
  }
}

export interface FakeStage {
  width: () => number;
  height: () => number;
  scaleX: () => number;
  scaleY: () => number;
  scale: () => void;
  position: () => void;
  x: () => number;
  y: () => number;
  getPointerPosition: () => { x: number; y: number };
  destroy: () => void;
}

export const fakeStage = (): FakeStage => ({
  width: () => 100,
  height: () => 100,
  scaleX: () => 1,
  scaleY: () => 1,
  scale: () => {},
  position: () => {},
  x: () => 0,
  y: () => 0,
  getPointerPosition: () => ({ x: 0, y: 0 }),
  destroy: () => {},
});

export const wall = (id: string, kind: WallSegment['kind'], y: number): WallSegment => ({
  id,
  kind,
  a: { x: 0, y },
  b: { x: 2, y },
});

/** Terreno base: un muro, una porta e una finestra più una luce. */
export const terrain: Terrain = {
  ambientLight: 'dark',
  visionLimitFeet: 120,
  visionEnabled: true,
  walls: [
    wall('wall-1', 'wall', 0),
    wall('door-1', 'door', 1),
    wall('window-1', 'window', 2),
  ],
  lights: [{
    id: 'light-1',
    x: 1,
    y: 1,
    brightFeet: 20,
    dimFeet: 40,
    color: '#ffcc80',
    enabled: true,
    shape: 'circle',
    angle: 60,
  }],
};

export const spawns: MapSpawn[] = [{
  id: 'spawn-1',
  kind: 'monster',
  x: 1,
  y: 1,
  source: { type: 'srd', monsterId: 'goblin' },
  size: 1,
  hidden: false,
  quantity: 1,
}];

export const starts: PlayerStart[] = [{ id: 'start-1', x: 2, y: 2 }];

export const flagsFor = (
  kind: MapLayerKind,
  value: Partial<LayerFlag> = {},
): LayerFlags => ({
  [kind]: { visible: true, locked: false, opacity: 1, ...value },
});

/**
 * Un layer è "nascosto" solo quando non ha figli disegnati.
 *
 * Il solo flag visible=false non basta: un layer spento ma ancora popolato
 * nasconderebbe il fatto che il render non ha escluso i nodi, rendendo
 * l'asserzione cieca. Per la visibilità esplicita si controlla visibleValue.
 */
export const hidden = (layer: FakeLayer): boolean =>
  layer.children.length === 0;

/** Alpha effettiva di una forma: opacità esplicita o canale alfa del fill. */
export const alphaOf = (node: ShapeLike): number => {
  const opacity = node.getAttr('opacity');
  if (typeof opacity === 'number' && opacity < 1) {
    return opacity;
  }
  const fill = node.getAttr('fill');
  if (typeof fill !== 'string') {
    return 1;
  }
  const rgba = /rgba\([^)]*,\s*([\d.]+)\)/.exec(fill);
  if (rgba !== null) {
    return Number(rgba[1]);
  }
  const hex = /^#([\da-f]{8})$/i.exec(fill);
  const hexDigits = hex?.[1];
  if (hexDigits !== undefined) {
    return Number.parseInt(hexDigits.slice(6), 16) / 255;
  }
  return 1;
};

/** Vista interna del componente: i layer reali sono sostituiti dai finti. */
export interface CanvasHarness {
  stage: FakeStage | null;
  mapLayer: FakeLayer | null;
  graphicsLayer: FakeLayer | null;
  constraintsLayer: FakeLayer | null;
  wallLayer: FakeLayer | null;
  lightLayer: FakeLayer | null;
  actorLayer: FakeLayer | null;
  overlayLayer: FakeLayer | null;
  container: () => { nativeElement: HTMLElement };
  renderAll(): void;
}

export interface CanvasLayers {
  map: FakeLayer;
  graphics: FakeLayer;
  constraints: FakeLayer;
  wall: FakeLayer;
  light: FakeLayer;
  actor: FakeLayer;
  overlay: FakeLayer;
}

export interface CanvasHandle {
  fixture: ComponentFixture<MapEditorCanvasComponent>;
  editor: CanvasHarness;
  layers: CanvasLayers;
}

/**
 * Monta il canvas senza eseguire `createStage`: i layer sono iniettati a mano
 * dopo aver impostato gli input di base. `afterNextRender` non scatta finché
 * il test non chiama `detectChanges`.
 */
export const mountCanvas = (): CanvasHandle => {
  const fixture = TestBed.createComponent(MapEditorCanvasComponent);
  const ref = fixture.componentRef;
  ref.setInput('grid', defaultGridConfig);
  ref.setInput('terrain', terrain);
  ref.setInput('spawns', []);
  ref.setInput('playerStarts', []);
  ref.setInput('tool', 'select');
  ref.setInput('selected', null);
  const editor = fixture.componentInstance as unknown as CanvasHarness;
  const layers: CanvasLayers = {
    map: new FakeLayer(),
    graphics: new FakeLayer(),
    constraints: new FakeLayer(),
    wall: new FakeLayer(),
    light: new FakeLayer(),
    actor: new FakeLayer(),
    overlay: new FakeLayer(),
  };
  editor.stage = fakeStage();
  editor.mapLayer = layers.map;
  editor.graphicsLayer = layers.graphics;
  editor.constraintsLayer = layers.constraints;
  editor.wallLayer = layers.wall;
  editor.lightLayer = layers.light;
  editor.actorLayer = layers.actor;
  editor.overlayLayer = layers.overlay;
  editor.container = () => ({ nativeElement: document.createElement('div') });
  return { fixture, editor, layers };
};
