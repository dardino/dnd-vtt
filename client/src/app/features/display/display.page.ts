import { Component, type OnDestroy, type OnInit, computed, inject, input, signal } from '@angular/core';
import type { DisplayLayer, DisplayState } from '@dnd-vtt/shared';
import type { Subscription } from 'rxjs';
import { ProgramService } from '../../core/program.service';
import { RealtimeService } from '../../core/realtime.service';
import { DisplayLayerComponent } from './display-layer.component';

@Component({
  selector: 'app-display-page',
  imports: [DisplayLayerComponent],
  templateUrl: './display.page.html',
  styleUrl: './display.page.scss',
})
export class DisplayPage implements OnInit, OnDestroy {
  public readonly code = input.required<string>();
  private readonly programs = inject(ProgramService);
  private readonly realtime = inject(RealtimeService);

  public readonly state = signal<DisplayState | null>(null);
  public readonly error = signal<string | null>(null);
  private subscription: Subscription | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private readonly onResize = (): void => this.sendViewport();

  public readonly base = computed<DisplayLayer | null>(() => this.state()?.composition.base ?? null);
  public readonly overlays = computed<DisplayLayer[]>(() =>
    this.state()?.composition.overlays ?? []);

  public readonly tokenSummary = computed(() =>
    (this.state()?.composition.base.scene?.tokens ?? [])
      .map((token) => `${token.id}:${token.x},${token.y}`)
      .join('|'));

  public readonly tokenPortraitCount = computed(() =>
    (this.base()?.scene?.tokens ?? [])
      .filter((token) => token.imageUrl !== null && token.portrait !== null)
      .length);

  public ngOnInit(): void {
    this.subscription = this.realtime.display$.subscribe((payload) => {
      this.state.set(payload.state);
      this.error.set(null);
    });
    void this.load();
    this.realtime.connectDisplay(this.code());
    this.sendViewport();
    window.addEventListener('resize', this.onResize);
    this.pollTimer = setInterval(() => {
      if (this.realtime.status() !== 'open') {
        void this.load();
      }
    }, 5000);
  }

  public ngOnDestroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.realtime.disconnect();
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  public async toggleFullscreen(): Promise<void> {
    if (document.fullscreenElement === null) {
      await document.documentElement.requestFullscreen().catch(() => undefined);
    } else {
      await document.exitFullscreen().catch(() => undefined);
    }
  }

  private async load(): Promise<void> {
    try {
      const state = await this.programs.displayState(this.code());
      this.state.set(state);
      this.error.set(null);
    } catch {
      this.error.set('Schermo non disponibile o revocato.');
    }
  }

  private sendViewport(): void {
    this.realtime.sendDisplayViewport(window.innerWidth, window.innerHeight);
  }
}
