import { TestBed } from '@angular/core/testing';
import { defaultGridConfig, defaultTerrain } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MapEditorCanvasComponent } from './map-editor-canvas.component';

const konva = vi.hoisted(() => {
  class Node {
    public readonly children: Node[] = [];

    public constructor(public readonly config: Record<string, unknown>) {}

    public getAttr(name: string): unknown { return this.config[name]; }

    public getChildren(): Node[] { return this.children; }

    public add(node: Node): void { this.children.push(node); }

    public on(): void {}

    public destroyChildren(): void { this.children.length = 0; }

    public draw(): void {}

    public destroy(): void {}

    public width(): number { return 1; }

    public height(): number { return 1; }

    public scaleX(): number { return 1; }

    public x(): number { return 0; }

    public y(): number { return 0; }
  }

  return {
    Circle: class extends Node {},
    Group: class extends Node {},
    Image: class extends Node {},
    Layer: class extends Node {},
    Line: class extends Node {},
    Rect: class extends Node {},
    Stage: class extends Node {},
    Text: class extends Node {},
    Wedge: class extends Node {},
  };
});

vi.mock('konva', () => ({ default: konva }));

interface BackgroundRenderer {
  mapLayer: InstanceType<typeof konva.Layer> | null;
  loadedImage: { url: string; element: HTMLImageElement } | null;
  renderMap(): void;
}

describe('MapEditorCanvasComponent background', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [MapEditorCanvasComponent] });
  });

  const create = (backgroundColor: string): {
    fixture: ReturnType<typeof TestBed.createComponent<MapEditorCanvasComponent>>;
    editor: BackgroundRenderer;
  } => {
    const fixture = TestBed.createComponent(MapEditorCanvasComponent);
    fixture.componentRef.setInput('grid', defaultGridConfig);
    fixture.componentRef.setInput('terrain', defaultTerrain);
    fixture.componentRef.setInput('backgroundColor', backgroundColor);
    const editor = fixture.componentInstance as unknown as BackgroundRenderer;
    editor.mapLayer = new konva.Layer({});
    return { fixture, editor };
  };

  it('disegna il foglio bianco con il colore configurato', () => {
    const { fixture, editor } = create('rgba(255, 0, 0, 1)');
    fixture.componentRef.setInput('image', { url: '', width: 100, height: 80 });

    editor.renderMap();

    const rect = editor.mapLayer?.getChildren()[0];
    expect(rect?.getAttr('fill')).toBe('rgba(255, 0, 0, 1)');
    fixture.destroy();
  });

  it('usa il colore anche sotto un\'immagine trasparente', () => {
    const { fixture, editor } = create('rgba(0, 128, 255, 0.5)');
    fixture.componentRef.setInput('image', { url: '/map.png', width: 100, height: 80 });
    editor.loadedImage = {
      url: '/map.png',
      element: { naturalWidth: 100, naturalHeight: 80 } as HTMLImageElement,
    };

    editor.renderMap();

    const group = editor.mapLayer?.getChildren()[0];
    expect(group?.getChildren()[0]?.getAttr('fill')).toBe('rgba(0, 128, 255, 0.5)');
    fixture.destroy();
  });
});
