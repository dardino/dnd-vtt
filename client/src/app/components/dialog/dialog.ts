import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';

@Component({
  selector: 'app-dialog',
  templateUrl: './dialog.html',
  styleUrl: './dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dialog {
  public readonly open = input(false);
  public readonly title = input.required<string>();
  public readonly dismissible = input(true);
  public readonly closed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  public constructor() {
    effect(() => {
      const element = this.dialog().nativeElement;
      if (this.open() && !element.open) {
        element.showModal();
      }
      if (!this.open() && element.open) {
        element.close();
      }
    });
  }

  protected cancel(event: Event): void {
    if (!this.dismissible()) {
      event.preventDefault();
      return;
    }
    this.closed.emit();
  }

  protected close(): void {
    if (this.dismissible()) {
      this.closed.emit();
    }
  }
}
