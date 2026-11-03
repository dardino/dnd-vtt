import { ChangeDetectionStrategy, Component, type OnInit, inject, signal } from '@angular/core';
import type { AuthSession } from '@dnd-vtt/shared';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/ui/toast.service';

const MAX_DEVICE_LENGTH = 48;

@Component({
  selector: 'app-auth-sessions-panel',
  templateUrl: './auth-sessions-panel.html',
  styleUrl: './auth-sessions-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthSessionsPanel implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly toasts = inject(ToastService);
  private readonly formatter = new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  public readonly sessions = signal<AuthSession[]>([]);
  public readonly loading = signal(true);
  public readonly error = signal<string | null>(null);
  public readonly revokingId = signal<string | null>(null);

  public ngOnInit(): void {
    void this.load();
  }

  public async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.sessions.set(await this.auth.sessions());
    } catch {
      this.error.set('Impossibile caricare le sessioni attive.');
    } finally {
      this.loading.set(false);
    }
  }

  public async revoke(session: AuthSession): Promise<void> {
    if (this.revokingId() !== null) {
      return;
    }
    this.revokingId.set(session.id);
    try {
      await this.auth.revokeSession(session.id);
      this.sessions.update((items) => items.filter((item) => item.id !== session.id));
      this.toasts.show('Sessione revocata.', 'success');
    } catch {
      this.toasts.show('Impossibile revocare la sessione.', 'error');
    } finally {
      this.revokingId.set(null);
    }
  }

  public isRevoking(id: string): boolean {
    return this.revokingId() === id;
  }

  public deviceLabel(session: AuthSession): string {
    const agent = session.userAgent?.trim() ?? '';
    if (agent === '') {
      return 'Dispositivo sconosciuto';
    }
    return agent.length > MAX_DEVICE_LENGTH
      ? `${agent.slice(0, MAX_DEVICE_LENGTH - 1)}…`
      : agent;
  }

  public formatDate(value: string): string {
    return this.formatter.format(new Date(value));
  }
}
