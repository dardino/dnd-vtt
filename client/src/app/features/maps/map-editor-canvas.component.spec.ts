import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  defaultGridConfig,
  type MapSpawn,
  type PlayerStart,
  type Terrain,
  type WallSegment,
} from '@dnd-vtt/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MapEditorCanvasComponent,
  type EditorSelection,
} from './map-editor-canvas.component';

const konva = vi.hoisted(() => {
  class MockNode {
    public readonly children: MockNode[] = [];

    public constructor(public readonly config: Record<string, unknown>) {}

    public getAttr(name: string): unknown {
      return this.config[name];
    }

    public getChildren(): MockNode[] { return this.children; }

    public add(node: MockNode): void {
      this.children.push(node);
    }

    public on(): void {
      // Gli handler di drag non servono ai test di rendering.
    }

    public destroyChildren(): void {
      this.children.length = 0;
    }

    public draw(): void {}

    public destroy(): void {}

    public width(): number { return 1; }

    public height(): number { return 1; }

    public scaleX(): number { return 1; }

    public x(): number { return 0; }

    public y(): number { return 0; }
  }

  return {
    Circle: class extends MockNode {},
    Group: class extends MockNode {},
    Layer: class extends MockNode {},
    Rect: class extends MockNode {},
    Line: class extends MockNode {},
    Stage: class extends MockNode {},
    Text: class extends MockNode {},
    Wedge: class extends MockNode {},
  };
});

vi.mock('konva', () => ({ default: konva }));

interface FakeStage {
  width: () => number; height: () => number;
  scaleX: () => number;
  scale: ReturnType<typeof vi.fn>;
  position: ReturnType<typeof vi.fn>;
  x: () => number; y: () => number;
  getPointerPosition: () => { x: number; y: number };
  destroy: ReturnType<typeof vi.fn>;
}

interface PanState {
  clientX: number;
  clientY: number;
  stageX: number;
  stageY: number;
}

interface ShapeLike {
  getAttr: (name: string) => unknown;
  getChildren: () => ShapeLike[];
}

class MockResizeObserver {
  public observe(): void {} public unobserve(): void {} public disconnect(): void {}
}

class FakeLayer {
  public readonly children: ShapeLike[] = [];

  public add(node: ShapeLike): void {
    this.children.push(node);
  }

  public destroyChildren(): void {
    this.children.length = 0;
  }

  public draw(): void {
    // Il layer reale disegna sul canvas; qui basta il conteggio dei nodi.
  }

  public listening(): void {}
}

interface RenderScheduler {
  renderFrame: number | null;
  stage: FakeStage | null;
  panning: PanState | null;
  wallLayer: FakeLayer | null;
  lightLayer: FakeLayer | null;
  actorLayer: FakeLayer | null;
  overlayLayer: FakeLayer | null;
  wallDraftKind: string | null;
  wallStart: { x: number; y: number } | null;
  wallCurrent: { x: number; y: number } | null;
  freehand: Array<{ x: number; y: number }> | null;
  container: () => { nativeElement: HTMLElement };
  scheduleRender(): void;
  renderCameraFrame(): void;
  renderAll(): void;
  renderScene(): boolean;
  renderOverlays(): void;
  renderMap(): void;
  renderGrid(): void;
  renderWalls(): void;
  renderLights(): void;
  renderActors(): void;
  renderOverlay(): void;
  onWheel(event: unknown): void;
  onPointerMove(event: unknown): void;
  onKeyDown(event: KeyboardEvent): void;
  ngOnDestroy(): void;
}

const wall = (
  id: string,
  kind: WallSegment['kind'],
  y: number,
  door?: WallSegment['door'],
): WallSegment => ({
  id,
  kind,
  a: { x: 0, y },
  b: { x: 2, y },
  ...(door === undefined ? {} : { door }),
});

const terrain: Terrain = {
  ambientLight: 'dark',
  visionLimitFeet: 120,
  visionEnabled: true,
  walls: [
    wall('wall-1', 'wall', 0),
    wall('door-1', 'door', 1, 'closed'),
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

const spawns: MapSpawn[] = [{
  id: 'spawn-1',
  kind: 'monster',
  x: 1,
  y: 1,
  source: { type: 'srd', monsterId: 'goblin' },
  size: 1,
  hidden: false,
  quantity: 1,
}];

const playerStarts: PlayerStart[] = [{ id: 'start-1', x: 2, y: 2 }];

const fakeStage = (): FakeStage => ({
  width: () => 100,
  height: () => 100,
  scaleX: () => 1,
  scale: vi.fn(),
  position: vi.fn(),
  x: () => 0,
  y: () => 0,
  getPointerPosition: () => ({ x: 10, y: 10 }),
  destroy: vi.fn(),
});

describe('MapEditorCanvasComponent rendering incrementale', () => {
  let callbacks: Map<number, FrameRequestCallback>;
  let nextFrameId: number;
  let requestFrame: ReturnType<typeof vi.fn<(callback: FrameRequestCallback) => number>>;
  let cancelFrame: ReturnType<typeof vi.fn<(id: number) => void>>;

  beforeEach(() => {
    callbacks = new Map();
    nextFrameId = 1;
    requestFrame = vi.fn((callback: FrameRequestCallback): number => {
      const id = nextFrameId;
      nextFrameId += 1;
      callbacks.set(id, callback);
      return id;
    });
    cancelFrame = vi.fn((id: number): void => {
      callbacks.delete(id);
    });
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    TestBed.configureTestingModule({ imports: [MapEditorCanvasComponent] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const createEditor = (): {
    fixture: ComponentFixture<MapEditorCanvasComponent>;
    editor: RenderScheduler;
  } => {
    const fixture = TestBed.createComponent(MapEditorCanvasComponent);
    const editor = fixture.componentInstance as unknown as RenderScheduler;
    // Ignora i frame eventualmente pianificati da Angular durante la creazione.
    callbacks.clear();
    nextFrameId = 1;
    requestFrame.mockClear();
    cancelFrame.mockClear();
    return { fixture, editor };
  };

  const flushFrame = (): void => {
    const pending = [...callbacks.values()];
    callbacks.clear();
    for (const callback of pending) {
      callback(0);
    }
  };

  const withInputs = (editor: RenderScheduler, fixture: ComponentFixture<MapEditorCanvasComponent>): void => {
    fixture.componentRef.setInput('grid', defaultGridConfig);
    fixture.componentRef.setInput('terrain', terrain);
    fixture.componentRef.setInput('spawns', spawns);
    fixture.componentRef.setInput('playerStarts', playerStarts);
    fixture.componentRef.setInput('selected', null);
    fixture.componentRef.setInput('tool', 'select');
    editor.container = () => ({ nativeElement: document.createElement('div') });
  };

  it('coalesce più richieste nello stesso frame in una sola render della camera', () => {
    const { fixture, editor } = createEditor();
    const camera = vi.spyOn(editor, 'renderCameraFrame').mockImplementation(() => {});

    editor.scheduleRender();
    editor.scheduleRender();

    expect(requestFrame).toHaveBeenCalledTimes(1);
    const pending = [...callbacks.values()];
    expect(pending).toHaveLength(1);
    pending[0]?.(0);

    expect(camera).toHaveBeenCalledTimes(1);
    expect(editor.renderFrame).toBeNull();
    fixture.destroy();
  });

  it('annulla il frame pendente alla distruzione', () => {
    const { fixture, editor } = createEditor();
    const camera = vi.spyOn(editor, 'renderCameraFrame').mockImplementation(() => {});

    editor.scheduleRender();
    expect(editor.renderFrame).toBe(1);

    fixture.destroy();

    expect(cancelFrame).toHaveBeenCalledWith(1);
    expect(editor.renderFrame).toBeNull();
    expect(callbacks.size).toBe(0);
    expect(camera).not.toHaveBeenCalled();
  });

  it('lo zoom ridisegna griglia e draft, non mappa né overlay', () => {
    const { fixture, editor } = createEditor();
    editor.stage = fakeStage();
    const grid = vi.spyOn(editor, 'renderGrid').mockImplementation(() => {});
    const map = vi.spyOn(editor, 'renderMap').mockImplementation(() => {});
    const overlay = vi.spyOn(editor, 'renderOverlays').mockImplementation(() => {});
    const walls = vi.spyOn(editor, 'renderWalls').mockImplementation(() => {});
    const lights = vi.spyOn(editor, 'renderLights').mockImplementation(() => {});
    const actors = vi.spyOn(editor, 'renderActors').mockImplementation(() => {});
    const draft = vi.spyOn(editor, 'renderOverlay').mockImplementation(() => {});

    editor.onWheel({ evt: { preventDefault: vi.fn(), deltaY: -1 } });
    flushFrame();

    expect(grid).toHaveBeenCalledTimes(1);
    expect(map).not.toHaveBeenCalled();
    expect(overlay).not.toHaveBeenCalled();
    expect(walls).not.toHaveBeenCalled();
    expect(lights).not.toHaveBeenCalled();
    expect(actors).not.toHaveBeenCalled();
    expect(draft).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('il pan ridisegna griglia e draft, non mappa né overlay', () => {
    const { fixture, editor } = createEditor();
    const stage = fakeStage();
    editor.stage = stage;
    editor.panning = { clientX: 100, clientY: 100, stageX: 0, stageY: 0 };
    const grid = vi.spyOn(editor, 'renderGrid').mockImplementation(() => {});
    const map = vi.spyOn(editor, 'renderMap').mockImplementation(() => {});
    const overlay = vi.spyOn(editor, 'renderOverlays').mockImplementation(() => {});
    const walls = vi.spyOn(editor, 'renderWalls').mockImplementation(() => {});

    editor.onPointerMove({
      evt: new MouseEvent('mousemove', { clientX: 90, clientY: 80 }),
    });
    flushFrame();

    expect(stage.position).toHaveBeenCalledWith({ x: -10, y: -20 });
    expect(grid).toHaveBeenCalledTimes(1);
    expect(map).not.toHaveBeenCalled();
    expect(overlay).not.toHaveBeenCalled();
    expect(walls).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('aggiorna la bozza attiva durante lo zoom senza ridisegnare la mappa', () => {
    const { fixture, editor } = createEditor();
    editor.stage = fakeStage();
    editor.wallDraftKind = 'wall';
    editor.wallStart = { x: 0, y: 0 };
    editor.wallCurrent = { x: 1, y: 0 };
    const grid = vi.spyOn(editor, 'renderGrid').mockImplementation(() => {});
    const map = vi.spyOn(editor, 'renderMap').mockImplementation(() => {});
    const draft = vi.spyOn(editor, 'renderOverlay').mockImplementation(() => {});

    editor.onWheel({ evt: { preventDefault: vi.fn(), deltaY: -1 } });
    flushFrame();

    expect(grid).toHaveBeenCalledTimes(1);
    expect(draft).toHaveBeenCalledTimes(1);
    expect(map).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('un cambio strutturale ridisegna scena e overlay', () => {
    const { fixture, editor } = createEditor();
    const scene = vi.spyOn(editor, 'renderScene').mockReturnValue(true);
    const overlay = vi.spyOn(editor, 'renderOverlays').mockImplementation(() => {});

    editor.renderAll();

    expect(scene).toHaveBeenCalledTimes(1);
    expect(overlay).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });

  it('renderOverlays include muri, luci, spawn/start e bozza', () => {
    const { fixture, editor } = createEditor();
    const walls = vi.spyOn(editor, 'renderWalls').mockImplementation(() => {});
    const lights = vi.spyOn(editor, 'renderLights').mockImplementation(() => {});
    const actors = vi.spyOn(editor, 'renderActors').mockImplementation(() => {});
    const draft = vi.spyOn(editor, 'renderOverlay').mockImplementation(() => {});

    editor.renderOverlays();

    expect(walls).toHaveBeenCalledTimes(1);
    expect(lights).toHaveBeenCalledTimes(1);
    expect(actors).toHaveBeenCalledTimes(1);
    expect(draft).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });

  it('conta le shape per layer e usa tratti a schermo costanti', () => {
    const { fixture, editor } = createEditor();
    withInputs(editor, fixture);

    const wallLayer = new FakeLayer();
    const lightLayer = new FakeLayer();
    const actorLayer = new FakeLayer();
    editor.wallLayer = wallLayer;
    editor.lightLayer = lightLayer;
    editor.actorLayer = actorLayer;

    editor.renderWalls();
    editor.renderLights();
    editor.renderActors();

    // 3 muri (di cui una porta con cerchio) + alone dim/bright/centro + 2 gruppi.
    expect(wallLayer.children).toHaveLength(4);
    expect(lightLayer.children).toHaveLength(3);
    expect(actorLayer.children).toHaveLength(2);
    expect(wallLayer.children.every((node) => node.getAttr('strokeScaleEnabled') === false)).toBe(true);
    expect(lightLayer.children.every((node) => node.getAttr('perfectDrawEnabled') === false)).toBe(true);
    for (const group of actorLayer.children) {
      expect(group.getChildren()).toHaveLength(2);
      expect(group.getChildren()[0]?.getAttr('strokeScaleEnabled')).toBe(false);
    }
    fixture.destroy();
  });

  describe('accessibilità da tastiera', () => {
    it('espone role img, tabindex e aria-label descrittivo', () => {
      const { fixture, editor } = createEditor();
      withInputs(editor, fixture);
      fixture.componentRef.setInput('tool', 'wall');
      fixture.detectChanges();

      const host = (fixture.nativeElement as HTMLElement)
        .querySelector<HTMLElement>('.map-editor-canvas');

      expect(host?.getAttribute('role')).toBe('img');
      expect(host?.getAttribute('tabindex')).toBe('0');
      expect(host?.getAttribute('aria-label') ?? '').toContain('strumento muro');
      expect(host?.getAttribute('aria-label') ?? '').toContain('Frecce');
      fixture.destroy();
    });

    it('sposta la camera con le frecce', () => {
      const { fixture, editor } = createEditor();
      const stage = fakeStage();
      editor.stage = stage;

      editor.onKeyDown(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));

      expect(stage.position).toHaveBeenCalledWith({ x: -48, y: 0 });
      fixture.destroy();
    });

    it('zooma con + e -', () => {
      const { fixture, editor } = createEditor();
      const stage = fakeStage();
      editor.stage = stage;

      editor.onKeyDown(new KeyboardEvent('keydown', { key: '+', cancelable: true }));

      expect(stage.scale).toHaveBeenCalledWith({ x: 1.15, y: 1.15 });
      fixture.destroy();
    });

    it('deseleziona con Escape', () => {
      const { fixture, editor } = createEditor();
      editor.stage = fakeStage();
      const selected: Array<EditorSelection | null> = [];
      fixture.componentInstance.elementSelected.subscribe((value) => selected.push(value));

      editor.onKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(selected).toEqual([null]);
      fixture.destroy();
    });

    it('ignora i tasti quando il focus è in un campo editabile', () => {
      const { fixture, editor } = createEditor();
      const stage = fakeStage();
      editor.stage = stage;
      const input = document.createElement('input');
      document.body.appendChild(input);

      const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true });
      input.dispatchEvent(event);
      editor.onKeyDown(event);

      expect(stage.position).not.toHaveBeenCalled();
      input.remove();
      fixture.destroy();
    });
  });
});
