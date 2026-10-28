import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type ButtonVariant = 'default' | 'primary' | 'danger' | 'ghost';

@Component({
  selector: 'app-button',
  templateUrl: './button.html',
  styleUrl: './button.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Button {
  public readonly variant = input<ButtonVariant>('default');
  public readonly type = input<'button' | 'submit' | 'reset'>('button');
  public readonly disabled = input(false);
  public readonly ariaLabel = input<string | null>(null);
  public readonly pressed = output<MouseEvent>();
}
