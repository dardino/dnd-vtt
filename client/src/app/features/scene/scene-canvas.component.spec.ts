import { TestBed, type ComponentFixture } from '@angular/core/testing';
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

  it('usa una trasformazione neutra di default senza sfondo', async () => {
    const fixture = TestBed.createComponent(SceneCanvasComponent);
    fixture.componentRef.setInput('state', createDefaultSceneState());

    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.backgroundTransform()).toEqual({ x: 0, y: 0, scale: 1 });
    expect(fixture.componentInstance.map()).toBeNull();
    fixture.destroy();
  });

  describe('accessibilità da tastiera', () => {
    const createCanvas = async (): Promise<{
      fixture: ComponentFixture<SceneCanvasComponent>;
      host: HTMLElement;
      component: SceneCanvasComponent;
    }> => {
      const fixture = TestBed.createComponent(SceneCanvasComponent);
      fixture.componentRef.setInput('state', createDefaultSceneState());
      fixture.detectChanges();
      await fixture.whenStable();
      const host = (fixture.nativeElement as HTMLElement)
        .querySelector<HTMLElement>('.scene-canvas');
      if (host === null) {
        throw new Error('host del canvas non trovato');
      }
      return { fixture, host, component: fixture.componentInstance };
    };

    it('espone role img, tabindex e aria-label descrittivo', async () => {
      const { fixture, host } = await createCanvas();

      expect(host.getAttribute('role')).toBe('img');
      expect(host.getAttribute('tabindex')).toBe('0');
      const label = host.getAttribute('aria-label') ?? '';
      expect(label).toContain('strumento selezione');
      expect(label).toContain('Frecce');
      expect(label).toContain('Esc');
      fixture.destroy();
    });

    it('sposta la camera con le frecce', async () => {
      const { fixture, host, component } = await createCanvas();

      host.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        bubbles: true,
        cancelable: true,
      }));
      expect(component.camera().x).toBe(-48);

      host.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      expect(component.camera().y).toBe(48);
      fixture.destroy();
    });

    it('zooma con + e -', async () => {
      const { fixture, host, component } = await createCanvas();
      const zoom = vi.spyOn(component, 'zoomBy');

      const plus = new KeyboardEvent('keydown', { key: '+', bubbles: true, cancelable: true });
      host.dispatchEvent(plus);
      expect(zoom).toHaveBeenCalledWith(1.15);
      expect(plus.defaultPrevented).toBe(true);

      host.dispatchEvent(new KeyboardEvent('keydown', { key: '-', bubbles: true }));
      expect(zoom).toHaveBeenLastCalledWith(1 / 1.15);
      fixture.destroy();
    });

    it('deseleziona il token con Escape', async () => {
      const { fixture, host, component } = await createCanvas();
      const selected: Array<string | null> = [];
      component.tokenSelected.subscribe((id) => selected.push(id));

      host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      expect(selected).toEqual([null]);
      fixture.destroy();
    });

    it('ignora i tasti quando il focus è in un campo editabile', async () => {
      const { fixture, host, component } = await createCanvas();
      const input = document.createElement('input');
      host.appendChild(input);
      const before = component.camera();
      const zoom = vi.spyOn(component, 'zoomBy');

      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));

      expect(component.camera()).toEqual(before);
      expect(zoom).not.toHaveBeenCalled();
      fixture.destroy();
    });
  });
});
