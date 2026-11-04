import { TestBed } from '@angular/core/testing';
import type { BlockedArea } from '@dnd-vtt/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearThemeColorsCache } from '../../core/ui/theme-colors';
import {
  alphaOf,
  flagsFor,
  hidden,
  mountCanvas,
  spawns,
  starts,
  type CanvasHandle,
} from './map-editor-canvas.test-helpers';
import { MapEditorCanvasComponent } from './map-editor-canvas.component';

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

const rectArea: BlockedArea = {
  id: 'area-rect',
  shape: 'rect',
  points: [{ x: 1, y: 1 }, { x: 3, y: 2 }],
};

const polygonArea: BlockedArea = {
  id: 'area-polygon',
  shape: 'polygon',
  points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }],
};

describe('MapEditorCanvasComponent constraints ed elements', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      public observe(): void {} public unobserve(): void {} public disconnect(): void {}
    });
    TestBed.configureTestingModule({ imports: [MapEditorCanvasComponent] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearThemeColorsCache();
  });

  const create = (): CanvasHandle => mountCanvas();

  it('senza layerFlags disegna aree, luci e attori con i default visibili', () => {
    const { fixture, editor, layers } = create();
    fixture.componentRef.setInput('blockedAreas', [rectArea]);
    fixture.componentRef.setInput('spawns', spawns);
    fixture.componentRef.setInput('playerStarts', starts);

    editor.renderAll();

    expect(layers.constraints.children).toHaveLength(1);
    expect(layers.light.children).toHaveLength(3);
    expect(layers.actor.children).toHaveLength(2);
    fixture.destroy();
  });

  describe('constraints', () => {
    it('disegna le aree bloccate in un layer separato dai muri', () => {
      const { fixture, editor, layers } = create();
      fixture.componentRef.setInput('blockedAreas', [rectArea, polygonArea]);

      editor.renderAll();

      expect(layers.constraints.children).toHaveLength(2);
      expect(layers.wall.children).toHaveLength(4);
      fixture.destroy();
    });

    it('usa un riempimento semitrasparente e un bordo distinto per le aree', () => {
      const { fixture, editor, layers } = create();
      fixture.componentRef.setInput('blockedAreas', [rectArea, polygonArea]);

      editor.renderAll();

      for (const node of layers.constraints.children) {
        const fill = node.getAttr('fill');
        const stroke = node.getAttr('stroke');
        expect(typeof fill).toBe('string');
        expect(fill).not.toBe('');
        expect(stroke).not.toBe(fill);
        expect(alphaOf(node)).toBeLessThan(1);
      }
      fixture.destroy();
    });

    it('usa il token --editor-blocked-area per il riempimento delle aree', () => {
      // Il colore non è hardcoded: deriva dal token CSS letto dal tema.
      clearThemeColorsCache();
      const { fixture, editor, layers } = create();
      const container = document.createElement('div');
      container.style.setProperty('--editor-blocked-area', '#123456');
      editor.container = () => ({ nativeElement: container });
      fixture.componentRef.setInput('blockedAreas', [rectArea]);

      editor.renderAll();

      expect(layers.constraints.children[0]?.getAttr('fill'))
        .toBe('rgba(18, 52, 86, 0.25)');
      fixture.destroy();
    });

    it('non disegna le aree quando il layer constraints è invisibile', () => {
      const { fixture, editor, layers } = create();
      fixture.componentRef.setInput('blockedAreas', [rectArea, polygonArea]);
      fixture.componentRef.setInput('layerFlags', flagsFor('constraints', { visible: false }));

      editor.renderAll();

      expect(hidden(layers.constraints)).toBe(true);
      expect(layers.constraints.children).toHaveLength(0);
      fixture.destroy();
    });

    it('applica l’opacità del layer constraints', () => {
      const { fixture, editor, layers } = create();
      fixture.componentRef.setInput('blockedAreas', [rectArea]);
      fixture.componentRef.setInput('layerFlags', flagsFor('constraints', { opacity: 0.3 }));

      editor.renderAll();

      expect(layers.constraints.opacityValue).toBeCloseTo(0.3, 5);
      fixture.destroy();
    });

    it('con il layer bloccato né aree né muri restano in ascolto', () => {
      const { fixture, editor, layers } = create();
      fixture.componentRef.setInput('blockedAreas', [rectArea]);
      fixture.componentRef.setInput('layerFlags', flagsFor('constraints', { locked: false }));

      editor.renderAll();
      expect(layers.constraints.listeningValue).not.toBe(false);
      expect(layers.wall.listeningValue).not.toBe(false);

      fixture.componentRef.setInput('layerFlags', flagsFor('constraints', { locked: true }));
      editor.renderAll();
      expect(layers.constraints.listeningValue).toBe(false);
      expect(layers.wall.listeningValue).toBe(false);
      fixture.destroy();
    });

    it('nasconde i muri quando il layer constraints è invisibile', () => {
      const { fixture, editor, layers } = create();

      editor.renderAll();
      expect(hidden(layers.wall)).toBe(false);

      fixture.componentRef.setInput('layerFlags', flagsFor('constraints', { visible: false }));
      editor.renderAll();

      // I muri vivono in un layer Konva separato ma appartengono a constraints.
      expect(hidden(layers.wall)).toBe(true);
      expect(layers.wall.children).toHaveLength(0);
      fixture.destroy();
    });

    it('applica l’opacità del layer constraints anche ai muri', () => {
      const { fixture, editor, layers } = create();
      fixture.componentRef.setInput('layerFlags', flagsFor('constraints', { opacity: 0.3 }));

      editor.renderAll();

      expect(layers.wall.children.length).toBeGreaterThan(0);
      expect(layers.wall.opacityValue).toBeCloseTo(0.3, 5);
      fixture.destroy();
    });
  });

  describe('elements', () => {
    it('non disegna luci e attori quando il layer elements è invisibile', () => {
      const { fixture, editor, layers } = create();
      fixture.componentRef.setInput('spawns', spawns);
      fixture.componentRef.setInput('playerStarts', starts);
      fixture.componentRef.setInput('layerFlags', flagsFor('elements', { visible: false }));

      editor.renderAll();

      expect(hidden(layers.light)).toBe(true);
      expect(hidden(layers.actor)).toBe(true);
      expect(layers.light.children).toHaveLength(0);
      expect(layers.actor.children).toHaveLength(0);
      fixture.destroy();
    });

    it('applica l’opacità del layer elements a luci e attori', () => {
      const { fixture, editor, layers } = create();
      fixture.componentRef.setInput('spawns', spawns);
      fixture.componentRef.setInput('playerStarts', starts);
      fixture.componentRef.setInput('layerFlags', flagsFor('elements', { opacity: 0.3 }));

      editor.renderAll();

      expect(layers.light.children.length).toBeGreaterThan(0);
      expect(layers.actor.children.length).toBeGreaterThan(0);
      expect(layers.light.opacityValue).toBeCloseTo(0.3, 5);
      expect(layers.actor.opacityValue).toBeCloseTo(0.3, 5);
      fixture.destroy();
    });

    it('con il layer elements bloccato luci e attori non restano in ascolto', () => {
      const { fixture, editor, layers } = create();
      fixture.componentRef.setInput('spawns', spawns);
      fixture.componentRef.setInput('playerStarts', starts);
      fixture.componentRef.setInput('layerFlags', flagsFor('elements', { locked: false }));

      editor.renderAll();
      expect(layers.light.listeningValue).not.toBe(false);
      expect(layers.actor.listeningValue).not.toBe(false);

      fixture.componentRef.setInput('layerFlags', flagsFor('elements', { locked: true }));
      editor.renderAll();
      expect(layers.light.listeningValue).toBe(false);
      expect(layers.actor.listeningValue).toBe(false);
      fixture.destroy();
    });

    it('con uno strumento diverso da select muri e luci non ascoltano', () => {
      const { fixture, editor, layers } = create();
      fixture.componentRef.setInput('tool', 'wall');

      editor.renderAll();

      expect(layers.wall.listeningValue).toBe(false);
      expect(layers.light.listeningValue).toBe(false);
      fixture.destroy();
    });
  });
});
