/**
 * Nodo Konva finto condiviso dagli spec del canvas mappa.
 *
 * jsdom non implementa `HTMLCanvasElement.getContext('2d')`: senza mock ogni
 * `new Konva.*` esplode durante il render. Usalo solo come factory:
 *
 *   vi.mock('konva', () => import('./map-editor-canvas.konva-mock'));
 *
 * Espone config/attrs e figli per le asserzioni e conserva gli handler
 * registrati con `on` così i test possono simulare eventi con `fire`.
 */
export class MockNode {
  public readonly children: MockNode[] = [];
  private readonly attrs = new Map<string, unknown>();
  private readonly handlers = new Map<string, Array<() => void>>();

  public constructor(public readonly config: Record<string, unknown>) {}

  public getAttr(name: string): unknown {
    return this.attrs.has(name) ? this.attrs.get(name) : this.config[name];
  }

  public getChildren(): MockNode[] { return this.children; }

  public add(node: MockNode): void { this.children.push(node); }

  public on(event: string, handler: () => void): void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
  }

  public fire(event: string): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler();
    }
  }

  public hasHandler(event: string): boolean { return this.handlers.has(event); }

  public destroyChildren(): void { this.children.length = 0; }

  public draw(): void {}

  public destroy(): void {}

  public listening(_value?: boolean): void {}

  public visible(_value?: boolean): void {}

  public opacity(value?: number): number { return this.measure('opacity', value); }

  public width(value?: number): number { return this.measure('width', value); }

  public height(value?: number): number { return this.measure('height', value); }

  public x(value?: number): number { return this.measure('x', value); }

  public y(value?: number): number { return this.measure('y', value); }

  public scaleX(value?: number): number { return this.measure('scaleX', value); }

  public scaleY(value?: number): number { return this.measure('scaleY', value); }

  public offset(value?: { x: number; y: number }): void {
    if (value !== undefined) {
      this.attrs.set('offsetX', value.x);
      this.attrs.set('offsetY', value.y);
    }
  }

  public scale(value?: { x: number; y: number }): void {
    if (value !== undefined) {
      this.attrs.set('scaleX', value.x);
      this.attrs.set('scaleY', value.y);
    }
  }

  private measure(name: string, value?: number): number {
    if (value !== undefined) {
      this.attrs.set(name, value);
    }
    const current = this.attrs.get(name) ?? this.config[name];
    return typeof current === 'number' ? current : 1;
  }
}

const konva = {
  Circle: class extends MockNode {},
  Group: class extends MockNode {},
  Image: class extends MockNode {},
  Layer: class extends MockNode {},
  Line: class extends MockNode {},
  Rect: class extends MockNode {},
  Stage: class extends MockNode {},
  Text: class extends MockNode {},
  Wedge: class extends MockNode {},
};

export default konva;
