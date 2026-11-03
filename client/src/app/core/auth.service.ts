import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import type { AuthSession, AuthSessionList } from '@dnd-vtt/shared';
import { firstValueFrom } from 'rxjs';
import { httpMessage } from './http-error';

export type DmRole = 'dm' | 'none';

interface MeResponse {
  role: DmRole;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  public readonly role = signal<DmRole | 'unknown'>('unknown');
  public readonly error = signal<string | null>(null);

  public async refresh(): Promise<DmRole> {
    try {
      const response = await firstValueFrom(this.http.get<MeResponse>('/api/v1/auth/me'));
      this.role.set(response.role);
      return response.role;
    } catch {
      this.role.set('none');
      return 'none';
    }
  }

  public async login(password: string): Promise<boolean> {
    this.error.set(null);
    try {
      await firstValueFrom(this.http.post<MeResponse>('/api/v1/auth/dm', { password }));
      this.role.set('dm');
      return true;
    } catch (error) {
      this.error.set(this.messageFor(error));
      return false;
    }
  }

  public async logout(): Promise<void> {
    await firstValueFrom(this.http.delete('/api/v1/auth/dm'));
    this.role.set('none');
  }

  public async sessions(): Promise<AuthSession[]> {
    const response = await firstValueFrom(
      this.http.get<AuthSessionList>('/api/v1/auth/sessions'),
    );
    return response.items;
  }

  public async revokeSession(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`/api/v1/auth/sessions/${encodeURIComponent(id)}`));
  }

  private messageFor(error: unknown): string {
    return httpMessage(error, {
      fallback: 'Impossibile contattare il server.',
      byStatus: {
        429: 'Troppi tentativi: attendi un minuto e riprova.',
        401: 'Password non valida.',
      },
    });
  }
}
