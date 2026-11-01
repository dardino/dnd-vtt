import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';
import { newId } from '@dnd-vtt/shared';

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
  protected readonly titleId = `dialog-title-${newId()}`;
  private programmaticClose = false;

  public constructor() {
    effect(() => {
      const element = this.dialog().nativeElement;
      if (this.open() && !element.open) {
        element.showModal();
      }
      if (!this.open() && element.open) {
        this.programmaticClose = true;
        element.close();
      }
    });
  }

  protected cancel(event: Event): void {
    // Esc non deve chiudere due volte: il dialog viene chiuso una sola volta
    // dal nostro handler, che emette `closed` in modo controllato.
    event.preventDefault();
    if (this.dismissible()) {
      this.requestClose();
    }
  }

  protected close(): void {
    if (this.programmaticClose) {
      this.programmaticClose = false;
      return;
    }
    if (this.dismissible()) {
      this.requestClose();
    }
  }

  private requestClose(): void {
    this.programmaticClose = true;
    this.closed.emit();
    this.dialog().nativeElement.close();
  }
}
