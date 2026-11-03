import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import type { SceneTool } from '../scene/scene-canvas.component';
import { SceneToolsStore } from './scene-tools.store';

/**
 * Toolbar verticale degli strumenti di scena della console DM: il tool attivo e
 * la visibilità griglia vivono nello `SceneToolsStore`, mentre zoom, fit, dadi,
 * export, history e impostazioni sono delegati alla pagina che ospita la scena.
 */
@Component({
  selector: 'app-scene-toolbar',
  templateUrl: './scene-toolbar.html',
  styleUrl: './scene-toolbar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SceneToolbar {
  public readonly sceneTools = inject(SceneToolsStore);

  public readonly canUndo = input(false);
  public readonly canRedo = input(false);

  public readonly openDice = output<void>();
  public readonly exportPng = output<void>();
  public readonly undo = output<void>();
  public readonly redo = output<void>();
  public readonly settings = output<void>();
  public readonly zoomIn = output<void>();
  public readonly zoomOut = output<void>();
  public readonly fitMap = output<void>();

  public setTool(tool: SceneTool): void {
    this.sceneTools.setTool(tool);
  }

  public toggleGrid(): void {
    this.sceneTools.toggleGrid();
  }
}
