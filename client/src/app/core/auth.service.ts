import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

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

  private messageFor(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 429) {
      return 'Troppi tentativi: attendi un minuto e riprova.';
    }
    if (error instanceof HttpErrorResponse && error.status === 401) {
      return 'Password non valida.';
    }
    return 'Impossibile contattare il server.';
  }
}
