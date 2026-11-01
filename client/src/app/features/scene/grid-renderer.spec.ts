import { defaultGridConfig } from '@dnd-vtt/shared';
import { describe, expect, it, vi } from 'vitest';
import { GridRenderer, type GridRenderParams } from './grid-renderer';

const konva = vi.hoisted(() => {
  interface ShapeConfig {
    sceneFunc?: (context: unknown, shape: unknown) => void;
    stroke?: string;
    strokeWidth?: number;
    opacity?: number;
    listening?: boolean;
  }

  class MockShape {
    public constructor(public readonly config: ShapeConfig) {}
  }

  class MockLayer {
    public readonly children: MockShape[] = [];
    public clipValue: unknown = null;
    public drawCount = 0;

    public add(node: MockShape): void {
      this.children.push(node);
    }

    public destroyChildren(): void {
      this.children.length = 0;
    }

    public clip(value: unknown): void {
      this.clipValue = value;
    }

    public draw(): void {
      this.drawCount += 1;
    }
  }

  return { MockLayer, MockShape };
});

vi.mock('konva', () => ({
  default: {
    Layer: konva.MockLayer,
    Shape: konva.MockShape,
  },
}));

interface DrawCall {
  op: string;
  args: number[];
}

interface RecordedContext {
  calls: DrawCall[];
  beginPath: () => void;
  moveTo: (x: number, y: number) => void;
  lineTo: (x: number, y: number) => void;
  closePath: () => void;
  strokeShape: (shape: unknown) => void;
}

const createContext = (): RecordedContext => {
  const calls: DrawCall[] = [];
  return {
    calls,
    beginPath: () => calls.push({ op: 'beginPath', args: [] }),
    moveTo: (x, y) => calls.push({ op: 'moveTo', args: [x, y] }),
    lineTo: (x, y) => calls.push({ op: 'lineTo', args: [x, y] }),
    closePath: () => calls.push({ op: 'closePath', args: [] }),
    strokeShape: () => calls.push({ op: 'strokeShape', args: [] }),
  };
};

const count = (context: RecordedContext, op: string): number =>
  context.calls.filter((call) => call.op === op).length;

const render = (overrides: Partial<GridRenderParams> = {}): {
  layer: InstanceType<typeof konva.MockLayer>;
} => {
  const layer = new konva.MockLayer();
  new GridRenderer().render({
    layer: layer as unknown as GridRenderParams['layer'],
    grid: defaultGridConfig,
    visible: true,
    color: '#5a5a5a',
    camera: { scale: 1, x: 0, y: 0 },
    viewport: { width: 140, height: 140 },
    map: null,
    ...overrides,
  });
  return { layer };
};

const drawShape = (layer: InstanceType<typeof konva.MockLayer>): RecordedContext => {
  const shape = layer.children[0];
  if (shape === undefined) {
    throw new Error('shape della griglia non creata');
  }
  const sceneFunc = shape.config.sceneFunc;
  if (sceneFunc === undefined) {
    throw new Error('sceneFunc mancante');
  }
  const context = createContext();
  sceneFunc(context, shape);
  return context;
};

describe('GridRenderer', () => {
  it('disegna una griglia quadrata con le linee visibili e lo stile atteso', () => {
    const { layer } = render();
    const context = drawShape(layer);
    const shape = layer.children[0];

    expect(layer.children).toHaveLength(1);
    expect(shape?.config.stroke).toBe('#5a5a5a');
    expect(shape?.config.strokeWidth).toBe(1);
    expect(shape?.config.opacity).toBe(0.65);
    expect(shape?.config.listening).toBe(false);
    // 140 / 70 = 2 celle: 3 linee verticali + 3 orizzontali.
    expect(count(context, 'moveTo')).toBe(6);
    expect(count(context, 'lineTo')).toBe(6);
    expect(count(context, 'strokeShape')).toBe(1);
    expect(layer.clipValue).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(layer.drawCount).toBe(1);
  });

  it('adatta lo spessore alla scala e limita il clip alla mappa', () => {
    const { layer } = render({
      camera: { scale: 2, x: 0, y: 0 },
      viewport: { width: 1600, height: 1600 },
      map: { width: 500, height: 400 },
    });
    const shape = layer.children[0];

    expect(shape?.config.strokeWidth).toBe(0.5);
    expect(layer.clipValue).toEqual({ x: 0, y: 0, width: 500, height: 400 });
    // 500 / 70 -> colonne 0..8, 400 / 70 -> righe 0..6.
    const context = drawShape(layer);
    expect(count(context, 'moveTo')).toBe(9 + 7);
    expect(count(context, 'lineTo')).toBe(9 + 7);
  });

  it('disegna un esagono chiuso per ogni cella della griglia esagonale', () => {
    const grid = { ...defaultGridConfig, type: 'hex' as const };
    const { layer } = render({
      grid,
      viewport: { width: 300, height: 300 },
    });
    const context = drawShape(layer);
    const rowStep = defaultGridConfig.cellSizePx * (Math.sqrt(3) / 2);
    const rows = Math.ceil(300 / rowStep) + 1 - (Math.floor(0 / rowStep) - 1) + 1;
    const columns = Math.ceil(300 / defaultGridConfig.cellSizePx) + 1
      - (Math.floor(0 / defaultGridConfig.cellSizePx) - 1) + 1;
    const hexes = rows * columns;

    expect(layer.children).toHaveLength(1);
    expect(count(context, 'closePath')).toBe(hexes);
    expect(count(context, 'moveTo')).toBe(hexes);
    expect(count(context, 'lineTo')).toBe(hexes * 5);
    expect(count(context, 'strokeShape')).toBe(1);
  });

  it('non disegna nulla quando la griglia è nascosta', () => {
    const { layer } = render({ visible: false, color: '' });

    expect(layer.children).toHaveLength(0);
    expect(layer.clipValue).toBeNull();
    expect(layer.drawCount).toBe(1);
  });

  it('ripulisce il layer prima di ridisegnare', () => {
    const { layer } = render();
    const previous = new konva.MockShape({});
    layer.children.push(previous);

    new GridRenderer().render({
      layer: layer as unknown as GridRenderParams['layer'],
      grid: defaultGridConfig,
      visible: true,
      color: '#5a5a5a',
      camera: { scale: 1, x: 0, y: 0 },
      viewport: { width: 140, height: 140 },
      map: null,
    });

    expect(layer.children).toHaveLength(1);
    expect(layer.children[0]).not.toBe(previous);
  });
});
