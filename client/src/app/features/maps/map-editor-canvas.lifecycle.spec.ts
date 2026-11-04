import { TestBed } from '@angular/core/testing';
import type { MapGraphic } from '@dnd-vtt/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mountCanvas,
  type CanvasHandle,
} from './map-editor-canvas.test-helpers';
import { MapEditorCanvasComponent, type EditorMapImage } from './map-editor-canvas.component';

const konva = vi.hoisted(() => {
  class MockNode {
    public readonly children: MockNode[] = [];
    private readonly attrs = new Map<string, unknown>();

    public constructor(public readonly config: Record<string, unknown>) {}

    public getAttr(name: string): unknown {
      return this.attrs.has(name) ? this.attrs.get(name) : this.config[name];
    }

    public getChildren(): MockNode[] { return this.children; }

    public add(node: MockNode): void { this.children.push(node); }

    public on(): void {}

    public destroyChildren(): void { this.children.length = 0; }

    public draw(): void {}

    public destroy(): void {}

    public width(value?: number): number { return this.measure('width', value); }

    public height(value?: number): number { return this.measure('height', value); }

    public x(value?: number): number { return this.measure('x', value); }

    public y(value?: number): number { return this.measure('y', value); }

    public scaleX(value?: number): number { return this.measure('scaleX', value); }

    public scaleY(value?: number): number { return this.measure('scaleY', value); }

    public opacity(value?: number): number { return this.measure('opacity', value); }

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
      const current = this.attrs.get(name);
      return typeof current === 'number' ? current : 1;
    }
  }

  return {
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
});

vi.mock('konva', () => ({ default: konva }));

/** Image che non emette eventi da sola: il test decide quando arriva `onload`. */
class PendingImage {
  public static instances: PendingImage[] = [];

  public onload: (() => void) | null = null;
  public naturalWidth = 100;
  public naturalHeight = 50;
  public src = '';

  public constructor() {
    PendingImage.instances.push(this);
  }

  public fireLoad(): void {
    this.onload?.();
  }
}

const pending = (): PendingImage => {
  const image = PendingImage.instances.at(-1);
  if (image === undefined) {
    throw new Error('nessuna Image in caricamento');
  }
  return image;
};

const background: EditorMapImage = { url: '/bg.png', width: 400, height: 300 };

const graphic = (id: string): MapGraphic => ({
  id,
  kind: 'image',
  assetId: '0f8fad5b-d9cb-469f-a165-70867728950e',
  x: 10,
  y: 20,
  scale: 1,
  rotation: 0,
  flipH: false,
  flipV: false,
  opacity: 1,
  z: 0,
});

describe('MapEditorCanvasComponent lifecycle asincrono', () => {
  beforeEach(() => {
    PendingImage.instances = [];
    vi.stubGlobal('Image', PendingImage);
    vi.stubGlobal('ResizeObserver', class {
      public observe(): void {} public unobserve(): void {} public disconnect(): void {}
    });
    TestBed.configureTestingModule({ imports: [MapEditorCanvasComponent] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const create = (): CanvasHandle => mountCanvas();

  it('dopo destroy un onload di sfondo tardivo non disegna più sul layer', () => {
    const { fixture, editor, layers } = create();
    fixture.componentRef.setInput('image', background);
    editor.renderAll();

    expect(PendingImage.instances).toHaveLength(1);
    const adds = layers.map.addCount;
    const draws = layers.map.drawCount;

    fixture.destroy();
    pending().fireLoad();

    expect(layers.map.addCount).toBe(adds);
    expect(layers.map.drawCount).toBe(draws);
  });

  it('dopo destroy un onload di grafica tardivo non aggiunge nodi', () => {
    const { fixture, editor, layers } = create();
    fixture.componentRef.setInput('graphics', [{
      item: graphic('g1'),
      image: { url: '/g.png', width: 10, height: 10 },
    }]);
    editor.renderAll();

    expect(PendingImage.instances).toHaveLength(1);
    const adds = layers.graphics.addCount;
    const draws = layers.graphics.drawCount;

    fixture.destroy();
    pending().fireLoad();

    expect(layers.graphics.addCount).toBe(adds);
    expect(layers.graphics.drawCount).toBe(draws);
  });
});
