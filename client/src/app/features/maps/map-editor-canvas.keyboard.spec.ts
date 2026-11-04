import { TestBed } from '@angular/core/testing';
import {
  defaultGridConfig,
  defaultTerrain,
  type MapSpawn,
  type WallSegment,
} from '@dnd-vtt/shared';
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

const spawn = (): MapSpawn => ({
  id: 'spawn-1',
  kind: 'monster',
  x: 2,
  y: 3,
  size: 1,
  quantity: 1,
  hidden: false,
  source: { type: 'srd', monsterId: 'goblin' },
});

const wall = (): WallSegment => ({
  id: 'wall-1',
  kind: 'wall',
  a: { x: 1, y: 1 },
  b: { x: 2, y: 1 },
});

describe('MapEditorCanvasComponent movement', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [MapEditorCanvasComponent] });
  });

  const create = () => {
    const fixture = TestBed.createComponent(MapEditorCanvasComponent);
    fixture.componentRef.setInput('grid', defaultGridConfig);
    fixture.componentRef.setInput('terrain', defaultTerrain);
    fixture.componentRef.setInput('spawns', [spawn()]);
    fixture.componentRef.setInput('tool', 'select');
    return fixture;
  };

  it('sposta lo spawn selezionato di una cella con le frecce', () => {
    const fixture = create();
    fixture.componentRef.setInput('selected', { type: 'spawn', id: 'spawn-1' });
    const moved: Array<{ cell: { x: number; y: number } }> = [];
    fixture.componentInstance.elementMoved.subscribe((event) => moved.push(event));

    fixture.componentInstance.onKeyDown(new KeyboardEvent('keydown', { key: 'ArrowRight' }));

    expect(moved).toEqual([{
      selection: { type: 'spawn', id: 'spawn-1' },
      cell: { x: 3, y: 3 },
    }]);
    fixture.destroy();
  });

  it('sposta il muro selezionato di un bordo con le frecce', () => {
    const fixture = create();
    fixture.componentRef.setInput('terrain', { ...defaultTerrain, walls: [wall()] });
    fixture.componentRef.setInput('selected', { type: 'wall', id: 'wall-1' });
    const moved: Array<{ id: string; dx: number; dy: number }> = [];
    fixture.componentInstance.wallMoved.subscribe((event) => moved.push(event));

    fixture.componentInstance.onKeyDown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));

    expect(moved).toEqual([{ id: 'wall-1', dx: 0, dy: 1 }]);
    fixture.destroy();
  });
});
