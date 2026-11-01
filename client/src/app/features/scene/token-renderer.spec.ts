import { defaultGridConfig, type TokenState } from '@dnd-vtt/shared';
import { describe, expect, it, vi } from 'vitest';
import { TokenRenderer, type TokenColors, type TokenRenderParams } from './token-renderer';

const konva = vi.hoisted(() => {
  interface NodeConfig {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    cornerRadius?: number;
    fill?: string;
    fillEnabled?: boolean;
    stroke?: string;
    strokeWidth?: number;
    opacity?: number;
    draggable?: boolean;
    text?: string;
    fontSize?: number;
    align?: string;
    wrap?: string;
    image?: unknown;
    clipFunc?: unknown;
    listening?: boolean;
  }

  class MockNode {
    public readonly children: MockNode[] = [];

    public constructor(public readonly config: NodeConfig = {}) {}

    public add(node: MockNode): void {
      this.children.push(node);
    }
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
    Group: konva.MockNode,
    Rect: konva.MockNode,
    Image: konva.MockNode,
    Text: konva.MockNode,
  },
}));

const colors: TokenColors = {
  text: '#e8e8e8',
  surface: '#242424',
  accent: '#c9a227',
  danger: '#b3261e',
  ok: '#2e7d32',
};

const token = (overrides: Partial<TokenState> = {}): TokenState => ({
  id: 'token-1',
  label: 'Goblin',
  x: 2,
  y: 3,
  size: 1,
  rotation: 0,
  elevation: 0,
  hp: { current: 5, max: 10, temp: 0 },
  conditions: [],
  visible: true,
  ...overrides,
});

const image = (width: number, height: number): HTMLImageElement =>
  ({ naturalWidth: width, naturalHeight: height }) as HTMLImageElement;

const render = (overrides: Partial<TokenRenderParams> = {}): {
  layer: InstanceType<typeof konva.MockLayer>;
  nodes: ReturnType<TokenRenderer['render']>;
} => {
  const layer = new konva.MockLayer();
  const nodes = new TokenRenderer().render({
    layer: layer as unknown as TokenRenderParams['layer'],
    tokens: [token()],
    grid: defaultGridConfig,
    colors,
    selectedTokenId: null,
    stageScale: 1,
    draggable: true,
    images: new Map(),
    actorPortraits: {},
    tokenPortraits: {},
    ...overrides,
  });
  return { layer, nodes };
};

describe('TokenRenderer', () => {
  it('disegna forma, PF e label di un token senza ritratto', () => {
    const { layer, nodes } = render({ tokens: [token({ owner: 'players' })] });
    const group = layer.children[0];

    expect(layer.children).toHaveLength(1);
    expect(nodes).toHaveLength(1);
    expect(group?.config).toMatchObject({ x: 175, y: 245, draggable: true });
    // 70 px di cella: centro (2 + 0.5) * 70 = 175, (3 + 0.5) * 70 = 245.
    const surface = group?.children[0];
    expect(surface?.config).toMatchObject({
      x: -35,
      y: -35,
      width: 70,
      height: 70,
      cornerRadius: 6,
      fill: colors.ok,
      stroke: colors.text,
      strokeWidth: 1.25,
      opacity: 1,
    });
    const hpBackground = group?.children[1];
    const hpFill = group?.children[2];
    expect(hpBackground?.config).toMatchObject({ width: 56, fill: colors.danger });
    expect(hpFill?.config).toMatchObject({ width: 28, fill: colors.ok });
    const label = group?.children[3];
    expect(label?.config).toMatchObject({
      text: 'Goblin',
      width: 280,
      fontSize: 12,
      y: 37,
      fill: colors.text,
    });
    expect(layer.drawCount).toBe(1);
  });

  it('ritaglia il ritratto dentro la forma del token', () => {
    const portrait = { url: 'ritratto.png', focusX: 0.5, focusY: 0.5, zoom: 1 };
    const { layer } = render({
      tokenPortraits: { 'token-1': portrait },
      images: new Map([[portrait.url, image(100, 200)]]),
    });
    const group = layer.children[0];
    const clip = group?.children[0];
    const outline = group?.children[1];

    expect(clip?.config.opacity).toBe(1);
    expect(clip?.config.clipFunc).toBeTypeOf('function');
    expect(clip?.children[0]?.config).toMatchObject({
      x: -35,
      y: -70,
      width: 70,
      height: 140,
      listening: false,
    });
    expect(outline?.config).toMatchObject({
      fillEnabled: false,
      stroke: colors.text,
      strokeWidth: 1.25,
    });
    // Ritratto + bordo, barra PF (2) e label: la forma piena non viene aggiunta.
    expect(group?.children).toHaveLength(5);
  });

  it('salta i token nascosti ma mostra quello selezionato', () => {
    const hidden = token({ visible: false });
    const { layer, nodes } = render({ tokens: [hidden] });

    expect(nodes).toHaveLength(0);
    expect(layer.children).toHaveLength(0);
    expect(layer.drawCount).toBe(1);

    const selected = render({ tokens: [hidden], selectedTokenId: hidden.id });

    expect(selected.nodes).toHaveLength(1);
    const surface = selected.layer.children[0]?.children[0];
    expect(surface?.config).toMatchObject({ opacity: 0.45, stroke: colors.accent });
  });

  it('evidenzia il token selezionato con bordo e spessore dedicati', () => {
    const { layer } = render({ selectedTokenId: 'token-1', stageScale: 2 });
    const surface = layer.children[0]?.children[0];

    expect(surface?.config).toMatchObject({ stroke: colors.accent, strokeWidth: 1.25 });
  });

  it('non rende trascinabile il token quando il canvas è in sola lettura', () => {
    const { layer } = render({ draggable: false });

    expect(layer.children[0]?.config.draggable).toBe(false);
  });

  it('ripulisce i nodi precedenti prima di ridisegnare', () => {
    const { layer } = render();
    layer.children.push(new konva.MockNode({}));

    const again = new TokenRenderer().render({
      layer: layer as unknown as TokenRenderParams['layer'],
      tokens: [],
      grid: defaultGridConfig,
      colors,
      selectedTokenId: null,
      stageScale: 1,
      draggable: true,
      images: new Map(),
      actorPortraits: {},
      tokenPortraits: {},
    });

    expect(again).toHaveLength(0);
    expect(layer.children).toHaveLength(0);
    expect(layer.drawCount).toBe(2);
  });
});
