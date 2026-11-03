import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { httpMessage } from '../../core/api/http-error';
import { PlayerService } from '../../core/services/player.service';
import { Button } from '../../components/button/button';
import { Dialog } from '../../components/dialog/dialog';
import { QrCode } from '../../components/qr-code/qr-code';
import { playerLinkWarning } from './player-link-warning';

@Component({
  selector: 'app-actor-sheet-player-link',
  imports: [Button, Dialog, QrCode],
  templateUrl: './actor-sheet-player-link.html',
  styleUrl: './actor-sheet-player-link.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActorSheetPlayerLink {
  public readonly actorId = input.required<string>();

  private readonly players = inject(PlayerService);
  private readonly linkInput = viewChild<ElementRef<HTMLInputElement>>('linkInput');
  private loadGeneration = 0;

  public readonly url = signal<string | null>(null);
  public readonly linkActive = signal(false);
  public readonly editing = signal(true);
  public readonly busy = signal(false);
  public readonly error = signal<string | null>(null);
  public readonly confirmOpen = signal(false);
  public readonly copyHint = signal(false);

  public readonly warning = computed<string | null>(() =>
    playerLinkWarning(this.url(), location.hostname));

  public constructor() {
    // Ricarica quando cambia l'attore mostrato dalla scheda.
    effect(() => {
      const actorId = this.actorId();
      void this.load(actorId);
    });
  }

  public async share(): Promise<void> {
    await this.createLink();
  }

  public requestRegenerate(): void {
    if (this.linkActive()) {
      this.confirmOpen.set(true);
      return;
    }
    void this.createLink();
  }

  public confirmRegenerate(): void {
    this.confirmOpen.set(false);
    void this.createLink();
  }

  public cancelRegenerate(): void {
    this.confirmOpen.set(false);
  }

  public async copy(): Promise<void> {
    const url = this.url();
    if (url === null) {
      return;
    }
    if (navigator.clipboard === undefined) {
      this.selectForManualCopy();
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      this.copyHint.set(false);
    } catch {
      // La copia è un'utilità: se il browser la nega l'URL resta selezionabile.
      this.selectForManualCopy();
    }
  }

  public async toggleEditing(): Promise<void> {
    if (this.busy()) {
      return;
    }
    const generation = this.loadGeneration;
    this.busy.set(true);
    this.error.set(null);
    try {
      const link = await this.players.setEditing(this.actorId(), !this.editing());
      if (generation !== this.loadGeneration) {
        return;
      }
      if (link !== null) {
        this.editing.set(link.editingEnabled);
      }
    } catch (error) {
      if (generation === this.loadGeneration) {
        this.error.set(this.messageFor(error));
      }
    } finally {
      this.busy.set(false);
    }
  }

  private async load(actorId: string): Promise<void> {
    const generation = ++this.loadGeneration;
    this.url.set(null);
    this.linkActive.set(false);
    this.confirmOpen.set(false);
    this.copyHint.set(false);
    this.error.set(null);
    try {
      const link = await this.players.getLink(actorId);
      if (generation !== this.loadGeneration) {
        return;
      }
      this.linkActive.set(link !== null);
      this.editing.set(link?.editingEnabled ?? true);
    } catch (error) {
      if (generation === this.loadGeneration) {
        this.error.set(this.messageFor(error));
      }
    }
  }

  private async createLink(): Promise<void> {
    if (this.busy()) {
      return;
    }
    const generation = this.loadGeneration;
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.players.createLink(this.actorId());
      if (generation !== this.loadGeneration) {
        return;
      }
      this.url.set(result.url);
      this.linkActive.set(true);
      this.editing.set(true);
      this.copyHint.set(false);
      await this.copy();
    } catch (error) {
      if (generation === this.loadGeneration) {
        this.error.set(this.messageFor(error));
      }
    } finally {
      this.busy.set(false);
    }
  }

  /** Seleziona l'URL dopo il render; utile quando la clipboard non è disponibile. */
  private selectForManualCopy(): void {
    this.copyHint.set(true);
    const select = (): void => {
      this.linkInput()?.nativeElement.select();
    };
    select();
    setTimeout(select, 0);
  }

  private messageFor(error: unknown): string {
    return httpMessage(error, { fallback: 'Impossibile caricare il link giocatore.' });
  }
}
