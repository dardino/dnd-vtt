import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { DisplayLayer, DisplayState } from '@dnd-vtt/shared';
import { DisplayLayerComponent } from '../display/display-layer.component';

@Component({
  selector: 'app-screen-preview',
  imports: [DisplayLayerComponent],
  templateUrl: './screen-preview.component.html',
  styleUrl: './screen-preview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenPreviewComponent {
  public readonly state = input.required<DisplayState>();

  public readonly base = computed<DisplayLayer>(() => this.state().composition.base);
  public readonly overlays = computed<DisplayLayer[]>(() => this.state().composition.overlays);
}
