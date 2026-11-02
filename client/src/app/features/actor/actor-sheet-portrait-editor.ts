import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';

export interface PortraitFocus {
  readonly focusX: number;
  readonly focusY: number;
}

@Component({
  selector: 'app-actor-sheet-portrait-editor',
  templateUrl: './actor-sheet-portrait-editor.html',
  styleUrl: './actor-sheet-portrait-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActorSheetPortraitEditor {
  public readonly url = input.required<string | null>();
  public readonly focusX = input.required<number>();
  public readonly focusY = input.required<number>();
  public readonly zoom = input.required<number>();
  public readonly busy = input(false);

  public readonly upload = output<File>();
  public readonly focusChange = output<PortraitFocus>();
  public readonly zoomChange = output<number>();
  public readonly save = output<void>();

  public readonly dragging = signal(false);

  public startDrag(event: PointerEvent): void {
    if (this.url() === null) {
      return;
    }
    const element = event.currentTarget as HTMLElement;
    element.setPointerCapture(event.pointerId);
    this.dragging.set(true);
    this.move(event);
  }

  public move(event: PointerEvent): void {
    if (!this.dragging()) {
      return;
    }
    const element = event.currentTarget as HTMLElement;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    this.focusChange.emit({
      focusX: Math.max(0.02, Math.min(0.98, x)),
      focusY: Math.max(0.02, Math.min(0.98, y)),
    });
  }

  public finishDrag(): void {
    if (!this.dragging()) {
      return;
    }
    this.dragging.set(false);
    this.save.emit();
  }

  public setZoom(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(value)) {
      this.zoomChange.emit(Math.max(1, Math.min(3, value)));
    }
  }

  public commitZoom(): void {
    this.save.emit();
  }

  public selectFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file !== undefined) {
      this.upload.emit(file);
    }
  }
}
