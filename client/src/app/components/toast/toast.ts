import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-toast',
  templateUrl: './toast.html',
  styleUrl: './toast.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Toast {
  private readonly service = inject(ToastService);

  public readonly toasts = this.service.toasts;

  protected dismiss(id: string): void {
    this.service.dismiss(id);
  }
}
