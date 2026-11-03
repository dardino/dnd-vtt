import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Button } from '../../components/button/button';
import { Dialog } from '../../components/dialog/dialog';
import { RegiaStore } from './regia.store';
import { ScreenPreviewComponent } from './screen-preview.component';

@Component({
  selector: 'app-screen-viewer-dialog',
  imports: [Button, Dialog, ScreenPreviewComponent],
  templateUrl: './screen-viewer-dialog.html',
  styleUrl: './screen-viewer-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenViewerDialog {
  public readonly regia = inject(RegiaStore);

  public readonly open = computed(() => this.regia.screenDialog() !== null);
  public readonly title = computed(
    () => `Schermo ${this.regia.screenDialog()?.display.code ?? ''}`,
  );

  public zoomScreen(event: WheelEvent): void {
    event.preventDefault();
    this.regia.zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12);
  }

  public resetScreenView(): void {
    this.regia.resetView();
  }

  public startScreenPan(event: PointerEvent): void {
    if (this.regia.screenViewport() === null) {
      return;
    }
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.regia.startPan(event.clientX, event.clientY);
  }

  public moveScreenPan(event: PointerEvent): void {
    this.regia.movePan(
      event.clientX,
      event.clientY,
      (event.currentTarget as HTMLElement).getBoundingClientRect(),
    );
  }

  public endScreenPan(): void {
    this.regia.endPan();
  }

  public close(): void {
    this.regia.closeScreenDialog();
  }
}
