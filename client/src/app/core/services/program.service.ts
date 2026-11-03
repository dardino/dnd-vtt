import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  CreateDisplay,
  Display,
  DisplayState,
  DisplayStateEnvelope,
  ProgramComposition,
  ProgramState,
  ProgramVersion,
} from '@dnd-vtt/shared';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ProgramService {
  private readonly http = inject(HttpClient);

  public async get(campaignId: string): Promise<ProgramVersion> {
    return firstValueFrom(
      this.http.get<ProgramVersion>(`/api/v1/campaigns/${campaignId}/program`),
    );
  }

  public async put(
    campaignId: string,
    version: number,
    state: ProgramState,
  ): Promise<ProgramVersion> {
    return firstValueFrom(
      this.http.put<ProgramVersion>(`/api/v1/campaigns/${campaignId}/program`, { version, state }),
    );
  }

  public async createDisplay(campaignId: string, input: CreateDisplay = {}): Promise<Display> {
    return firstValueFrom(
      this.http.post<Display>(`/api/v1/campaigns/${campaignId}/displays`, input),
    );
  }

  public async putDisplayComposition(
    campaignId: string,
    displayId: string,
    version: number,
    composition: ProgramComposition,
  ): Promise<{ version: number; composition: ProgramComposition }> {
    return firstValueFrom(
      this.http.put<{ version: number; composition: ProgramComposition }>(
        `/api/v1/campaigns/${campaignId}/displays/${displayId}/composition`,
        { version, composition },
      ),
    );
  }

  public async putDisplayViewport(
    campaignId: string,
    displayId: string,
    viewport: { x: number; y: number; zoom: number },
  ): Promise<{ version: number; viewport: { x: number; y: number; zoom: number } }> {
    return firstValueFrom(
      this.http.put<{ version: number; viewport: { x: number; y: number; zoom: number } }>(
        `/api/v1/campaigns/${campaignId}/displays/${displayId}/viewport`,
        { viewport },
      ),
    );
  }

  public async listDisplays(campaignId: string): Promise<Display[]> {
    const result = await firstValueFrom(
      this.http.get<{ items: Display[] }>(`/api/v1/campaigns/${campaignId}/displays`),
    );
    return result.items;
  }

  public async listOnlineDisplays(campaignId: string): Promise<Display[]> {
    const result = await firstValueFrom(
      this.http.get<{ items: Display[] }>(`/api/v1/campaigns/${campaignId}/displays/online`),
    );
    return result.items;
  }

  public async getDisplayState(code: string): Promise<DisplayStateEnvelope> {
    return firstValueFrom(
      this.http.get<DisplayStateEnvelope>(`/api/v1/displays/${code}`),
    );
  }

  public async revokeDisplay(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`/api/v1/displays/${id}`));
  }

  public async displayState(code: string): Promise<DisplayState> {
    return (await this.getDisplayState(code)).state;
  }
}
