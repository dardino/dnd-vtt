import { TestBed } from '@angular/core/testing';
import { createDefaultSceneState } from '@dnd-vtt/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneCanvasComponent } from './scene-canvas.component';

/**
 * In jsdom non esiste `canvas.getContext('2d')`: Konva viene sostituito da
 * nodi minimi che registrano le chiamate, così lo smoke test verifica il
 * ciclo di vita del componente (creazione stage, layer e render) senza crash.
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

describe('SceneCanvasComponent', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    TestBed.configureTestingModule({ imports: [SceneCanvasComponent] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('crea lo stage e renderizza senza mappa né token', async () => {
    const fixture = TestBed.createComponent(SceneCanvasComponent);
    fixture.componentRef.setInput('state', createDefaultSceneState());

    fixture.detectChanges();
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.scene-canvas__stage')).not.toBeNull();
    expect(fixture.componentInstance.canvasSize()).toEqual({ width: 1, height: 1 });
    expect(fixture.componentInstance.camera()).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('sopravvive alla distruzione del fixture dopo il render', async () => {
    const fixture = TestBed.createComponent(SceneCanvasComponent);
    fixture.componentRef.setInput('state', createDefaultSceneState());

    fixture.detectChanges();
    await fixture.whenStable();
    expect(() => fixture.destroy()).not.toThrow();
  });
});
