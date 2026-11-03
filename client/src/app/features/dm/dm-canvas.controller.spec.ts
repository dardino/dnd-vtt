import { TestBed } from '@angular/core/testing';
import type { MeasureResult } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MeasurementService } from '../../core/measurement.service';
import type { SceneCanvasComponent } from '../scene/scene-canvas.component';
import { DmCanvasController } from './dm-canvas.controller';
import { DmUiStore } from './dm-ui.store';
import { SceneToolsStore } from './scene-tools.store';

const measure = (): MeasureResult => ({
  from: { x: 0, y: 0 },
  to: { x: 2, y: 0 },
  cells: 2,
  feet: 10,
});

interface CanvasFake {
  zoomBy: ReturnType<typeof vi.fn>;
  fit: ReturnType<typeof vi.fn>;
  exportPng: ReturnType<typeof vi.fn>;
}

describe('DmCanvasController', () => {
  let controller: DmCanvasController;
  let canvas: CanvasFake;
  let setZoom: ReturnType<typeof vi.fn>;
  let setMeasure: ReturnType<typeof vi.fn>;
  let setStatusMessage: ReturnType<typeof vi.fn>;
  let formatDistance: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    canvas = {
      zoomBy: vi.fn(),
      fit: vi.fn(),
      exportPng: vi.fn(),
    };
    setZoom = vi.fn();
    setMeasure = vi.fn();
    setStatusMessage = vi.fn();
    formatDistance = vi.fn((feet: number) => `${feet} ft`);

    TestBed.configureTestingModule({
      providers: [
        { provide: DmUiStore, useValue: { setZoom, setStatusMessage } },
        { provide: SceneToolsStore, useValue: { setMeasure } },
        { provide: MeasurementService, useValue: { formatDistance } },
      ],
    });
    controller = TestBed.inject(DmCanvasController);
  });

  it('non fa nulla finché il canvas non è collegato', () => {
    expect(() => controller.zoomIn()).not.toThrow();
    expect(() => controller.fit()).not.toThrow();
    expect(() => controller.exportPng()).not.toThrow();
  });

  it('delega zoom, fit ed export al canvas collegato', () => {
    controller.attach(() => canvas as unknown as SceneCanvasComponent);

    controller.zoomIn();
    controller.zoomOut();
    controller.fit();
    controller.exportPng();

    expect(canvas.zoomBy).toHaveBeenNthCalledWith(1, 1.15);
    expect(canvas.zoomBy).toHaveBeenNthCalledWith(2, 1 / 1.15);
    expect(canvas.fit).toHaveBeenCalledTimes(1);
    expect(canvas.exportPng).toHaveBeenCalledTimes(1);
  });

  it('ignora un canvas non ancora disponibile', () => {
    controller.attach(() => undefined);

    controller.zoomIn();

    expect(canvas.zoomBy).not.toHaveBeenCalled();
  });

  it('il detach scollega solo il getter ancora corrente', () => {
    const detach = controller.attach(() => canvas as unknown as SceneCanvasComponent);
    const other = {
      zoomBy: vi.fn(),
      fit: vi.fn(),
      exportPng: vi.fn(),
    };
    controller.attach(() => other as unknown as SceneCanvasComponent);

    detach();
    controller.zoomIn();

    expect(other.zoomBy).toHaveBeenCalledWith(1.15);
    expect(canvas.zoomBy).not.toHaveBeenCalled();
  });

  it('propaga lo zoom della camera allo store UI', () => {
    controller.camera({ scale: 1.75 });

    expect(setZoom).toHaveBeenCalledWith(1.75);
  });

  it('registra la misura e formatta il messaggio di stato', () => {
    controller.measured(measure());

    expect(setMeasure).toHaveBeenCalledWith(measure());
    expect(formatDistance).toHaveBeenCalledWith(10);
    expect(setStatusMessage).toHaveBeenCalledWith('Misura: 10 ft (2 celle)');
  });

  it('azzera la misura senza aggiornare la statusbar', () => {
    controller.measured(null);

    expect(setMeasure).toHaveBeenCalledWith(null);
    expect(setStatusMessage).not.toHaveBeenCalled();
  });
});
