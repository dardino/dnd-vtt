import { defaultGridConfig, type FogState, type VisionGrid } from '@dnd-vtt/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FogRenderer,
  type FogDraftRenderParams,
  type FogRenderParams,
} from './fog-renderer';

const konva = vi.hoisted(() => {
  interface NodeConfig {
    image?: unknown;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    opacity?: number;
    listening?: boolean;
    stroke?: string;
    strokeWidth?: number;
    dash?: number[];
    fill?: string;
    points?: number[];
    lineCap?: string;
    lineJoin?: string;
    closed?: boolean;
  }

  class MockNode {
    public constructor(public readonly config: NodeConfig = {}) {}
  }

  class MockLayer {
    public readonly children: MockNode[] = [];
    public drawCount = 0;

    public add(node: MockNode): void {
      this.children.push(node);
    }

    public destroyChildren(): void {
      this.children.length = 0;
    }

    public draw(): void {
      this.drawCount += 1;
    }
  }

  return { MockLayer, MockNode };
});

vi.mock('konva', () => ({
  default: {
    Layer: konva.MockLayer,
    Image: konva.MockNode,
    Rect: konva.MockNode,
    Line: konva.MockNode,
  },
}));

interface RecordedCall {
  op: string;
  args: number[];
  alpha: number;
  composite: string;
}

class FakeContext {
  public fillStyle = '';
  public strokeStyle = '';
  public globalCompositeOperation = 'source-over';
  public globalAlpha = 1;
  public filter = 'none';
  public lineWidth = 0;
  public lineCap = 'butt';
  public lineJoin = 'miter';
  public readonly calls: RecordedCall[] = [];

  public fillRect(x: number, y: number, width: number, height: number): void {
    this.record('fillRect', [x, y, width, height]);
  }

  public beginPath(): void {
    this.record('beginPath', []);
  }

  public arc(x: number, y: number, radius: number, start: number, end: number): void {
    this.record('arc', [x, y, radius, start, end]);
  }

  public fill(): void {
    this.record('fill', []);
  }

  public moveTo(x: number, y: number): void {
    this.record('moveTo', [x, y]);
  }

  public lineTo(x: number, y: number): void {
    this.record('lineTo', [x, y]);
  }

  public closePath(): void {
    this.record('closePath', []);
  }

  public stroke(): void {
    this.record('stroke', []);
  }

  public save(): void {
    this.record('save', []);
  }

  public restore(): void {
    this.record('restore', []);
  }

  private record(op: string, args: number[]): void {
    this.calls.push({
      op,
      args,
      alpha: this.globalAlpha,
      composite: this.globalCompositeOperation,
    });
  }
}

let context: FakeContext;

const createLayer = (): InstanceType<typeof konva.MockLayer> => new konva.MockLayer();

const fogState = (overrides: Partial<FogState> = {}): FogState => ({
  base: 'hidden',
  ops: [],
  override: 'none',
  ...overrides,
});

const render = (
  overrides: Partial<FogRenderParams> = {},
  target = createLayer(),
): ReturnType<typeof createLayer> => {
  new FogRenderer().render({
    layer: target as unknown as FogRenderParams['layer'],
    map: { width: 200, height: 100 },
    grid: defaultGridConfig,
    fog: fogState(),
    vision: null,
    opacity: 0.5,
    ...overrides,
  });
  return target;
};

const renderDraft = (overrides: Partial<FogDraftRenderParams> = {}): ReturnType<typeof createLayer> => {
  const layer = createLayer();
  new FogRenderer().renderDraft({
    layer: layer as unknown as FogDraftRenderParams['layer'],
    draft: null,
    mode: 'rect',
    lasso: null,
    accent: '#c9a227',
    brushRadius: 150,
    stageScale: 1,
    ...overrides,
  });
  return layer;
};

const fillRects = (): RecordedCall[] => context.calls.filter((call) => call.op === 'fillRect');

beforeEach(() => {
  context = new FakeContext();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => context as unknown as CanvasRenderingContext2D,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FogRenderer', () => {
  it('copre l’intera mappa quando la base è hidden', () => {
    const layer = render();
    const image = layer.children[0];

    expect(layer.children).toHaveLength(1);
    expect(image?.config.width).toBe(200);
    expect(image?.config.height).toBe(100);
    expect(image?.config.opacity).toBe(0.5);
    expect(image?.config.listening).toBe(false);
    expect(image?.config.image).toBeInstanceOf(HTMLCanvasElement);
    expect(fillRects()).toEqual([
      { op: 'fillRect', args: [0, 0, 200, 100], alpha: 1, composite: 'source-over' },
    ]);
    expect(layer.drawCount).toBe(1);
  });

  it('lascia trasparente la base revealed senza visione', () => {
    render({ fog: fogState({ base: 'revealed' }) });

    expect(fillRects()).toHaveLength(0);
  });

  it('ritaglia le celle viste dalla visione con la luminosità del livello', () => {
    const vision: VisionGrid = { cols: 2, rows: 1, levels: [1, 2] };
    render({ vision });

    expect(fillRects()).toEqual([
      { op: 'fillRect', args: [0, 0, 200, 100], alpha: 1, composite: 'source-over' },
      { op: 'fillRect', args: [0, 0, 70.5, 70.5], alpha: 0.5, composite: 'destination-out' },
      { op: 'fillRect', args: [70, 0, 70.5, 70.5], alpha: 1, composite: 'destination-out' },
    ]);
    expect(context.globalCompositeOperation).toBe('source-over');
    expect(context.globalAlpha).toBe(1);
  });

  it('applica le operazioni manuali rispettando reveal e softness', () => {
    render({
      fog: fogState({
        ops: [{
          id: 'op-1',
          op: 'reveal',
          shape: { type: 'rect', x: 10, y: 20, width: 30, height: 40 },
          softness: 4,
        }],
      }),
    });

    const reveal = context.calls.find(
      (call) => call.op === 'fillRect' && call.args[0] === 10 && call.args[1] === 20,
    );
    expect(reveal).toEqual({
      op: 'fillRect',
      args: [10, 20, 30, 40],
      alpha: 1,
      composite: 'destination-out',
    });
    expect(context.calls.some((call) => call.op === 'save')).toBe(true);
    expect(context.calls.some((call) => call.op === 'restore')).toBe(true);
  });

  it('disegna la bozza rettangolare con lo stile dell’accento', () => {
    const layer = renderDraft({
      draft: { start: { x: 100, y: 80 }, current: { x: 20, y: 10 }, points: [] },
      mode: 'rect',
      stageScale: 2,
    });
    const rect = layer.children[0];

    expect(layer.children).toHaveLength(1);
    expect(rect?.config).toMatchObject({
      x: 20,
      y: 10,
      width: 80,
      height: 70,
      stroke: '#c9a227',
      strokeWidth: 1,
      dash: [4, 3],
      opacity: 0.2,
      listening: false,
    });
  });

  it('disegna la scia del pennello e il lazo della nebbia', () => {
    const brush = renderDraft({
      draft: { start: { x: 0, y: 0 }, current: { x: 40, y: 0 }, points: [{ x: 0, y: 0 }, { x: 40, y: 0 }] },
      mode: 'brush',
    });

    expect(brush.children).toHaveLength(2);
    expect(brush.children[0]?.config.strokeWidth).toBe(300);
    expect(brush.children[0]?.config.opacity).toBe(0.25);
    expect(brush.children[1]?.config.strokeWidth).toBe(2);
    expect(brush.children[1]?.config.points).toEqual([0, 0, 40, 0]);

    const lasso = renderDraft({ lasso: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] });

    expect(lasso.children).toHaveLength(1);
    expect(lasso.children[0]?.config.closed).toBe(true);
    expect(lasso.children[0]?.config.dash).toEqual([8, 6]);
  });

  it('ripulisce il layer prima di ridisegnare e senza mappa', () => {
    const layer = createLayer();
    layer.children.push(new konva.MockNode({}));

    render({}, layer);
    expect(layer.children).toHaveLength(1);

    render({ map: null }, layer);
    expect(layer.children).toHaveLength(0);
    expect(layer.drawCount).toBe(2);
  });
});
