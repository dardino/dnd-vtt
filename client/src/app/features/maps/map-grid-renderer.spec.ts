import { defaultGridConfig } from '@dnd-vtt/shared';
import { describe, expect, it, vi } from 'vitest';
import { MapGridRenderer, type MapGridRenderParams } from './map-grid-renderer';

const konva = vi.hoisted(() => {
  interface ShapeConfig {
    sceneFunc?: (context: unknown, shape: unknown) => void;
    stroke?: string;
    strokeWidth?: number;
    listening?: boolean;
  }

  class MockShape {
    public constructor(public readonly config: ShapeConfig) {}
  }

  class MockLayer {
    public readonly children: MockShape[] = [];
    public drawCount = 0;
    public destroyCount = 0;

    public add(node: MockShape): void {
      this.children.push(node);
    }

    public destroyChildren(): void {
      this.destroyCount += 1;
      this.children.length = 0;
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

const render = (overrides: Partial<MapGridRenderParams> = {}): {
  layer: InstanceType<typeof konva.MockLayer>;
  paths: number;
} => {
  const layer = new konva.MockLayer();
  const paths = new MapGridRenderer().render({
    layer: layer as unknown as MapGridRenderParams['layer'],
    grid: defaultGridConfig,
    visible: true,
    scale: 1,
    image: { width: 140, height: 140 },
    ...overrides,
  });
  return { layer, paths };
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

describe('MapGridRenderer', () => {
  it('crea una sola shape per la griglia quadrata con lo stile atteso', () => {
    const { layer, paths } = render();
    const context = drawShape(layer);
    const shape = layer.children[0];

    expect(layer.children).toHaveLength(1);
    expect(shape?.config.stroke).toBe('rgba(110, 180, 255, 0.42)');
    expect(shape?.config.strokeWidth).toBe(1);
    expect(shape?.config.listening).toBe(false);
    // 140 / 70 = 2 celle: 3 linee verticali + 3 orizzontali.
    expect(paths).toBe(6);
    expect(count(context, 'moveTo')).toBe(6);
    expect(count(context, 'lineTo')).toBe(6);
    expect(count(context, 'beginPath')).toBe(1);
    expect(count(context, 'strokeShape')).toBe(1);
    expect(layer.drawCount).toBe(1);
  });

  it('rispetta offset e scala della griglia quadrata', () => {
    const { layer, paths } = render({
      scale: 2,
      grid: { ...defaultGridConfig, offsetX: 20, offsetY: 10 },
      image: { width: 100, height: 100 },
    });
    const context = drawShape(layer);
    const shape = layer.children[0];

    // (100 - 20) / 70 e (100 - 10) / 70 -> 2 linee per asse.
    expect(paths).toBe(4);
    expect(shape?.config.strokeWidth).toBe(0.5);
    expect(context.calls[0]).toEqual({ op: 'beginPath', args: [] });
    expect(context.calls[1]).toEqual({ op: 'moveTo', args: [20, 10] });
    expect(context.calls[2]).toEqual({ op: 'lineTo', args: [20, 100] });
  });

  it('disegna un esagono chiuso per cella con una sola shape', () => {
    const rowStep = defaultGridConfig.cellSizePx * (Math.sqrt(3) / 2);
    const rows = Math.ceil(300 / rowStep) + 1;
    const columns = Math.ceil(300 / defaultGridConfig.cellSizePx) + 1;
    const hexes = rows * columns;
    const { layer, paths } = render({
      grid: { ...defaultGridConfig, type: 'hex' },
      image: { width: 300, height: 300 },
    });
    const context = drawShape(layer);

    expect(layer.children).toHaveLength(1);
    expect(paths).toBe(hexes);
    expect(count(context, 'closePath')).toBe(hexes);
    expect(count(context, 'moveTo')).toBe(hexes);
    expect(count(context, 'lineTo')).toBe(hexes * 5);
    expect(count(context, 'strokeShape')).toBe(1);
  });

  it('non crea shape quando la griglia è nascosta o manca l’immagine', () => {
    const hidden = render({ visible: false });

    expect(hidden.layer.children).toHaveLength(0);
    expect(hidden.paths).toBe(0);
    expect(hidden.layer.drawCount).toBe(1);

    const noImage = render({ image: null });

    expect(noImage.layer.children).toHaveLength(0);
    expect(noImage.paths).toBe(0);
  });

  it('ripulisce il layer prima di ridisegnare', () => {
    const layer = new konva.MockLayer();
    const target = layer as unknown as MapGridRenderParams['layer'];
    render({ layer: target });
    const previous = layer.children[0];

    const { paths } = render({ layer: target });

    expect(paths).toBe(6);
    expect(layer.destroyCount).toBe(2);
    expect(layer.children).toHaveLength(1);
    expect(layer.children[0]).not.toBe(previous);
  });

  it('salta la griglia esagonale oltre il limite di celle', () => {
    const { layer, paths } = render({
      grid: { ...defaultGridConfig, type: 'hex' },
      image: { width: 20_000, height: 20_000 },
    });

    expect(paths).toBe(0);
    expect(layer.children).toHaveLength(0);
  });
});
