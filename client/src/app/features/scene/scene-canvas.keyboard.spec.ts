import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  createDefaultSceneState,
  defaultTerrain,
  type SceneState,
  type TokenState,
  type WallSegment,
} from '@dnd-vtt/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SceneCanvasComponent,
  type SceneMapImage,
  type SceneTool,
  type TokenMoveEvent,
} from './scene-canvas.component';

/**
 * In jsdom non esiste `canvas.getContext('2d')`: Konva viene sostituito da
 * nodi minimali. La copia locale evita di dipendere dallo smoke test.
 */
vi.mock('konva', () => {
  class MockNode {
    public add(): void {}
    public on(): void {}
    public draw(): void {}
    public batchDraw(): void {}
    public destroy(): void {}
    public destroyChildren(): void {}
    public getChildren(): readonly unknown[] {
      return [];
    }

    public clip(): void {}
    public scale(): void {}
    public position(): void {}
    public draggable(): void {}
    public size(): void {}
  }

  class MockStage extends MockNode {
    private readonly config: { width?: number; height?: number };

    public constructor(config: { width?: number; height?: number } = {}) {
      super();
      this.config = config;
    }

    public width(): number {
      return this.config.width ?? 0;
    }

    public height(): number {
      return this.config.height ?? 0;
    }

    public scaleX(): number {
      return 1;
    }

    public x(): number {
      return 0;
    }

    public y(): number {
      return 0;
    }

    public getPointerPosition(): { x: number; y: number } | null {
      return null;
    }
  }

  return {
    default: {
      Stage: MockStage,
      Layer: MockNode,
      Shape: MockNode,
      Group: MockNode,
      Rect: MockNode,
      Image: MockNode,
      Line: MockNode,
      Circle: MockNode,
      Text: MockNode,
    },
  };
});

class MockResizeObserver {
  public observe(): void {}
  public unobserve(): void {}
  public disconnect(): void {}
}

const TOKEN_ID = 'token-1';

/** Mappa 5×5 celle da 70 px: gli angoli restano comodi per i clamp. */
const MAP: SceneMapImage = {
  url: '',
  previewUrl: '',
  hash: 'map-1',
  width: 350,
  height: 350,
  tiled: false,
};

const token = (overrides: Partial<TokenState> = {}): TokenState => ({
  id: TOKEN_ID,
  label: 'Goblin',
  x: 2,
  y: 2,
  size: 1,
  rotation: 0,
  elevation: 0,
  hp: { current: 10, max: 10, temp: 0 },
  conditions: [],
  visible: true,
  ...overrides,
});

const wall = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  extra: Partial<WallSegment> = {},
): WallSegment => ({
  id: `wall-${ax}-${ay}-${bx}-${by}-${extra.kind ?? 'wall'}`,
  kind: 'wall',
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  ...extra,
});

interface SceneStateOptions {
  tokens?: TokenState[];
  walls?: WallSegment[];
  grid?: Partial<SceneState['grid']>;
}

const sceneState = (options: SceneStateOptions = {}): SceneState => {
  const state = createDefaultSceneState('hidden', {
    ...defaultTerrain,
    walls: options.walls ?? [],
  });
  return {
    ...state,
    grid: { ...state.grid, ...options.grid },
    tokens: options.tokens ?? [],
  };
};

interface CanvasOptions {
  state?: SceneState;
  map?: SceneMapImage;
  selectedTokenId?: string | null;
  tool?: SceneTool;
  readOnly?: boolean;
}

interface CanvasHarness {
  readonly fixture: ComponentFixture<SceneCanvasComponent>;
  readonly host: HTMLElement;
  readonly container: HTMLElement;
  readonly component: SceneCanvasComponent;
  readonly moves: TokenMoveEvent[];
}

const createCanvas = async (options: CanvasOptions = {}): Promise<CanvasHarness> => {
  const fixture = TestBed.createComponent(SceneCanvasComponent);
  fixture.componentRef.setInput('state', options.state ?? sceneState());
  if (options.map !== undefined) {
    fixture.componentRef.setInput('map', options.map);
  }
  if (options.selectedTokenId !== undefined) {
    fixture.componentRef.setInput('selectedTokenId', options.selectedTokenId);
  }
  if (options.tool !== undefined) {
    fixture.componentRef.setInput('tool', options.tool);
  }
  if (options.readOnly !== undefined) {
    fixture.componentRef.setInput('readOnly', options.readOnly);
  }
  fixture.detectChanges();
  await fixture.whenStable();

  const root = fixture.nativeElement as HTMLElement;
  const host = root.querySelector<HTMLElement>('.scene-canvas');
  const container = root.querySelector<HTMLElement>('.scene-canvas__stage');
  if (host === null || container === null) {
    throw new Error('canvas non trovato');
  }
  const moves: TokenMoveEvent[] = [];
  fixture.componentInstance.tokenMoved.subscribe((event) => moves.push(event));
  return { fixture, host, container, component: fixture.componentInstance, moves };
};

const press = (
  target: HTMLElement,
  key: string,
  init: KeyboardEventInit = {},
): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
};

describe('SceneCanvasComponent — frecce sul token', () => {
  let harness: CanvasHarness | null = null;

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    TestBed.configureTestingModule({ imports: [SceneCanvasComponent] });
  });

  afterEach(() => {
    harness?.fixture.destroy();
    harness = null;
    vi.unstubAllGlobals();
  });

  it('sposta il token selezionato di una cella senza muovere la camera', async () => {
    harness = await createCanvas({
      state: sceneState({ tokens: [token()] }),
      selectedTokenId: TOKEN_ID,
      map: MAP,
    });
    const before = harness.component.camera();

    const event = press(harness.host, 'ArrowRight');

    expect(harness.moves).toEqual([{ tokenId: TOKEN_ID, x: 3, y: 2 }]);
    expect(harness.component.camera()).toEqual(before);
    expect(event.defaultPrevented).toBe(true);
  });

  it('senza token selezionato mantiene il pan della camera', async () => {
    harness = await createCanvas({ state: sceneState({ tokens: [token()] }) });

    press(harness.host, 'ArrowRight');

    expect(harness.moves).toEqual([]);
    expect(harness.component.camera()).toEqual({ scale: 1, x: -48, y: 0 });
  });

  it('con Shift fa pan invece di spostare il token', async () => {
    harness = await createCanvas({
      state: sceneState({ tokens: [token()] }),
      selectedTokenId: TOKEN_ID,
    });

    const event = press(harness.host, 'ArrowRight', { shiftKey: true });

    expect(harness.moves).toEqual([]);
    expect(harness.component.camera()).toEqual({ scale: 1, x: -144, y: 0 });
    expect(event.defaultPrevented).toBe(true);
  });

  it('con Alt forza il movimento oltre un muro', async () => {
    harness = await createCanvas({
      state: sceneState({
        tokens: [token()],
        walls: [wall(3, 2, 3, 3)],
      }),
      selectedTokenId: TOKEN_ID,
      map: MAP,
    });
    const before = harness.component.camera();

    const event = press(harness.host, 'ArrowRight', { altKey: true });

    expect(harness.moves).toEqual([{ tokenId: TOKEN_ID, x: 3, y: 2, force: true }]);
    expect(harness.component.camera()).toEqual(before);
    expect(event.defaultPrevented).toBe(true);
  });

  it('verso un muro non emette movimento e non muove la camera', async () => {
    harness = await createCanvas({
      state: sceneState({
        tokens: [token()],
        walls: [wall(3, 2, 3, 3)],
      }),
      selectedTokenId: TOKEN_ID,
      map: MAP,
    });
    const before = harness.component.camera();

    const event = press(harness.host, 'ArrowRight');

    expect(harness.moves).toEqual([]);
    expect(harness.component.camera()).toEqual(before);
    expect(event.defaultPrevented).toBe(true);
  });

  it('verso una porta chiusa non emette movimento', async () => {
    harness = await createCanvas({
      state: sceneState({
        tokens: [token()],
        walls: [wall(3, 2, 3, 3, { kind: 'door', door: 'closed' })],
      }),
      selectedTokenId: TOKEN_ID,
      map: MAP,
    });

    press(harness.host, 'ArrowRight');

    expect(harness.moves).toEqual([]);
  });

  it('in sola lettura non sposta il token', async () => {
    harness = await createCanvas({
      state: sceneState({ tokens: [token()] }),
      selectedTokenId: TOKEN_ID,
      readOnly: true,
      map: MAP,
    });
    const before = harness.component.camera();

    press(harness.host, 'ArrowRight');

    expect(harness.moves).toEqual([]);
    expect(harness.component.camera()).toEqual(before);
  });

  it('non intercetta le frecce quando il focus è in un campo editabile', async () => {
    harness = await createCanvas({
      state: sceneState({ tokens: [token()] }),
      selectedTokenId: TOKEN_ID,
      map: MAP,
    });
    const before = harness.component.camera();
    const input = document.createElement('input');
    harness.host.appendChild(input);

    const event = press(input, 'ArrowRight');

    expect(harness.moves).toEqual([]);
    expect(harness.component.camera()).toEqual(before);
    expect(event.defaultPrevented).toBe(false);
  });

  it('con lo strumento misura fa pan e non sposta il token', async () => {
    harness = await createCanvas({
      state: sceneState({ tokens: [token()] }),
      selectedTokenId: TOKEN_ID,
      tool: 'measure',
    });

    press(harness.host, 'ArrowRight');

    expect(harness.moves).toEqual([]);
    expect(harness.component.camera()).toEqual({ scale: 1, x: -48, y: 0 });
  });

  it('su griglia esagonale fa pan e non sposta il token', async () => {
    harness = await createCanvas({
      state: sceneState({ tokens: [token()], grid: { type: 'hex' } }),
      selectedTokenId: TOKEN_ID,
    });

    press(harness.host, 'ArrowRight');

    expect(harness.moves).toEqual([]);
    expect(harness.component.camera()).toEqual({ scale: 1, x: -48, y: 0 });
  });

  it('con un token selezionato assente dallo stato fa pan', async () => {
    harness = await createCanvas({
      state: sceneState({ tokens: [token()] }),
      selectedTokenId: 'ghost',
    });

    press(harness.host, 'ArrowRight');

    expect(harness.moves).toEqual([]);
    expect(harness.component.camera()).toEqual({ scale: 1, x: -48, y: 0 });
  });

  it('con size 2 blocca il movimento se il footprint di destinazione è invalido', async () => {
    harness = await createCanvas({
      state: sceneState({
        tokens: [token({ x: 2, y: 2, size: 2 })],
        // Il muro cade nell'interno della colonna 4: il footprint di arrivo
        // (colonne 3-4) non è piazzabile, mentre quello di partenza (2-3) sì.
        walls: [wall(4.4, 2.2, 4.4, 4.2)],
      }),
      selectedTokenId: TOKEN_ID,
      map: MAP,
    });

    press(harness.host, 'ArrowRight');

    expect(harness.moves).toEqual([]);
  });

  it('con size 2 si muove quando il footprint resta dentro la mappa', async () => {
    harness = await createCanvas({
      state: sceneState({ tokens: [token({ x: 1, y: 1, size: 2 })] }),
      selectedTokenId: TOKEN_ID,
      map: MAP,
    });

    press(harness.host, 'ArrowRight');

    expect(harness.moves).toEqual([{ tokenId: TOKEN_ID, x: 2, y: 1 }]);
  });

  it('con size 2 non esce dalla mappa a destra o in basso', async () => {
    harness = await createCanvas({
      state: sceneState({ tokens: [token({ x: 3, y: 3, size: 2 })] }),
      selectedTokenId: TOKEN_ID,
      map: MAP,
    });

    press(harness.host, 'ArrowRight');
    press(harness.host, 'ArrowDown');

    expect(harness.moves).toEqual([]);
  });

  it('consente la fuga da una cella invalida verso una valida', async () => {
    harness = await createCanvas({
      // Muro diagonale che attraversa l'interno di (11,4): la partenza è
      // invalida, ma il primo passo verso (12,4) deve essere permesso.
      state: sceneState({
        tokens: [token({ x: 11, y: 4 })],
        walls: [wall(11, 5, 12, 4)],
      }),
      selectedTokenId: TOKEN_ID,
    });

    press(harness.host, 'ArrowRight');

    expect(harness.moves).toEqual([{ tokenId: TOKEN_ID, x: 12, y: 4 }]);
  });

  it('descrive le frecce sul token nell’aria-label', async () => {
    harness = await createCanvas();

    const label = harness.host.getAttribute('aria-label') ?? '';

    expect(label).toContain('token selezionato');
    expect(label).toContain('Shift');
    expect(label).toContain('Alt');
    expect(label.toLowerCase()).toContain('forz');
    expect(label).toContain('Frecce');
  });

  it('porta il focus sull’host al click sul canvas', async () => {
    harness = await createCanvas();
    expect(document.activeElement).not.toBe(harness.host);

    for (const type of ['pointerdown', 'mousedown', 'click']) {
      harness.container.dispatchEvent(new MouseEvent(type, { bubbles: true }));
    }

    expect(document.activeElement).toBe(harness.host);
  });
});
