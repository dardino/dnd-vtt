import { Component, type OnDestroy, type OnInit, computed, inject, input, signal } from '@angular/core';
import type { DisplayLayer, DisplayState } from '@dnd-vtt/shared';
import { ProgramService } from '../../core/program.service';
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

  public readonly state = signal<DisplayState | null>(null);
  public readonly error = signal<string | null>(null);
  private socket: WebSocket | null = null;
  private retry = 1;
  private readonly timers: ReturnType<typeof setTimeout>[] = [];
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
    void this.load();
    this.connect();
    window.addEventListener('resize', this.onResize);
    this.pollTimer = setInterval(() => {
      if (this.socket === null || this.socket.readyState !== WebSocket.OPEN) {
        void this.load();
      }
    }, 5000);
  }

  public ngOnDestroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.socket?.close();
    this.socket = null;
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
    }
    for (const timer of this.timers) {
      clearTimeout(timer);
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
    const socket = this.socket;
    if (socket === null || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(JSON.stringify({
      v: 1,
      type: 'viewport',
      width: window.innerWidth,
      height: window.innerHeight,
    }));
  }

  private connect(): void {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(
      `${protocol}//${location.host}/ws?role=display&code=${encodeURIComponent(this.code())}`,
    );
    this.socket = socket;
    socket.addEventListener('open', () => {
      this.retry = 1;
      this.sendViewport();
    });
    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data as string) as {
          type?: string;
          payload?: { state?: DisplayState };
        };
        if ((message.type === 'hello' || message.type === 'display.updated') && message.payload?.state !== undefined) {
          this.state.set(message.payload.state);
          this.error.set(null);
        }
      } catch {
        // Un messaggio malformato non deve interrompere lo schermo.
      }
    });
    socket.addEventListener('close', () => {
      if (this.socket !== socket) {
        return;
      }
      this.socket = null;
      const delay = Math.min(30_000, this.retry * 1000);
      this.retry = Math.min(30, this.retry * 2);
      this.timers.push(setTimeout(() => this.connect(), delay));
    });
  }
}
