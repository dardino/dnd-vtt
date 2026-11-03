import { Injectable, inject } from '@angular/core';
import type { MeasureResult } from '@dnd-vtt/shared';
import { MeasurementService } from '../../core/ui/measurement.service';
import type { SceneCanvasComponent } from '../scene/scene-canvas.component';
import { DmUiStore } from './dm-ui.store';
import { SceneToolsStore } from './scene-tools.store';

const ZOOM_FACTOR = 1.15;

/**
 * Ponte fra la pagina e il canvas della scena: la pagina registra il getter
 * della `viewChild`, la toolbar/statusbar delegano qui zoom, fit ed export.
 * Anche camera e misura aggiornano gli store condivisi della console.
 */
@Injectable({ providedIn: 'root' })
export class DmCanvasController {
  private readonly ui = inject(DmUiStore);
  private readonly sceneTools = inject(SceneToolsStore);
  private readonly units = inject(MeasurementService);

  private getCanvas: () => SceneCanvasComponent | undefined = () => undefined;

  /** Collega il controller al canvas della pagina corrente. */
  attach(getCanvas: () => SceneCanvasComponent | undefined): () => void {
    this.getCanvas = getCanvas;
    return () => {
      if (this.getCanvas === getCanvas) {
        this.getCanvas = () => undefined;
      }
    };
  }

  zoomIn(): void {
    this.getCanvas()?.zoomBy(ZOOM_FACTOR);
  }

  zoomOut(): void {
    this.getCanvas()?.zoomBy(1 / ZOOM_FACTOR);
  }

  fit(): void {
    this.getCanvas()?.fit();
  }

  exportPng(): void {
    this.getCanvas()?.exportPng();
  }

  camera(camera: { scale: number }): void {
    this.ui.setZoom(camera.scale);
  }

  measured(measure: MeasureResult | null): void {
    this.sceneTools.setMeasure(measure);
    if (measure !== null) {
      this.ui.setStatusMessage(
        `Misura: ${this.units.formatDistance(measure.feet)} (${measure.cells} celle)`,
      );
    }
  }
}
