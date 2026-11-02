import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapEditorCanvasComponent } from './map-editor-canvas.component';

interface RenderScheduler {
  renderFrame: number | null;
  scheduleRender(): void;
  renderAll(): void;
  ngOnDestroy(): void;
}

describe('MapEditorCanvasComponent rendering incrementale', () => {
  let callbacks: Map<number, FrameRequestCallback>;
  let nextFrameId: number;
  let requestFrame: ReturnType<typeof vi.fn<(callback: FrameRequestCallback) => number>>;
  let cancelFrame: ReturnType<typeof vi.fn<(id: number) => void>>;

  beforeEach(() => {
    callbacks = new Map();
    nextFrameId = 1;
    requestFrame = vi.fn((callback: FrameRequestCallback): number => {
      const id = nextFrameId;
      nextFrameId += 1;
      callbacks.set(id, callback);
      return id;
    });
    cancelFrame = vi.fn((id: number): void => {
      callbacks.delete(id);
    });
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);
    TestBed.configureTestingModule({ imports: [MapEditorCanvasComponent] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const createEditor = (): {
    fixture: ComponentFixture<MapEditorCanvasComponent>;
    editor: RenderScheduler;
  } => {
    const fixture = TestBed.createComponent(MapEditorCanvasComponent);
    const editor = fixture.componentInstance as unknown as RenderScheduler;
    // Ignora i frame eventualmente pianificati da Angular durante la creazione.
    callbacks.clear();
    nextFrameId = 1;
    requestFrame.mockClear();
    cancelFrame.mockClear();
    return { fixture, editor };
  };

  it('coalesce più richieste nello stesso frame in una sola render', () => {
    const { fixture, editor } = createEditor();
    const render = vi.spyOn(editor, 'renderAll').mockImplementation(() => {});

    editor.scheduleRender();
    editor.scheduleRender();

    expect(requestFrame).toHaveBeenCalledTimes(1);
    const pending = [...callbacks.values()];
    expect(pending).toHaveLength(1);
    pending[0]?.(0);

    expect(render).toHaveBeenCalledTimes(1);
    expect(editor.renderFrame).toBeNull();
    fixture.destroy();
  });

  it('annulla il frame pendente alla distruzione', () => {
    const { fixture, editor } = createEditor();
    const render = vi.spyOn(editor, 'renderAll').mockImplementation(() => {});

    editor.scheduleRender();
    expect(editor.renderFrame).toBe(1);

    fixture.destroy();

    expect(cancelFrame).toHaveBeenCalledWith(1);
    expect(editor.renderFrame).toBeNull();
    expect(callbacks.size).toBe(0);
    expect(render).not.toHaveBeenCalled();
  });
});
