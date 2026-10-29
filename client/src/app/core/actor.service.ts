import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  Actor,
  ActorList,
  ActorStatblock,
  CreatePc,
  DmSheetView,
  LevelUpInput,
  LevelUpPreview,
  LevelUpResult,
  RestRequest,
  RestResult,
  SheetPatch,
  UpdateActor,
} from '@dnd-vtt/shared';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ActorService {
  private readonly http = inject(HttpClient);

  public async listByCampaign(campaignId: string): Promise<Actor[]> {
    const page = await firstValueFrom(
      this.http.get<ActorList>(`/api/v1/actors?campaignId=${campaignId}&limit=200`),
    );
    return page.items;
  }

  public async createPc(campaignId: string, input: CreatePc): Promise<Actor> {
    return firstValueFrom(
      this.http.post<Actor>(`/api/v1/campaigns/${campaignId}/actors`, input),
    );
  }

  public async rollStats(campaignId: string): Promise<{ rollId: string; values: number[]; expiresAt: string }> {
    return firstValueFrom(
      this.http.post<{ rollId: string; values: number[]; expiresAt: string }>(
        `/api/v1/campaigns/${campaignId}/actors/roll-stats`,
        {},
      ),
    );
  }

  public async createActor(input: {
    campaignId: string;
    kind: 'monster' | 'npc';
    name: string;
    statblock: ActorStatblock;
    dmNotes?: string;
  }): Promise<Actor> {
    return firstValueFrom(this.http.post<Actor>('/api/v1/actors', input));
  }

  public async getSheet(actorId: string): Promise<DmSheetView> {
    return firstValueFrom(this.http.get<DmSheetView>(`/api/v1/actors/${actorId}/sheet`));
  }

  public async patchSheet(actorId: string, input: SheetPatch): Promise<DmSheetView> {
    return firstValueFrom(
      this.http.patch<DmSheetView>(`/api/v1/actors/${actorId}/sheet`, input),
    );
  }

  public async patchActor(actorId: string, patch: UpdateActor): Promise<Actor> {
    return firstValueFrom(this.http.patch<Actor>(`/api/v1/actors/${actorId}`, patch));
  }

  public async rest(campaignId: string, input: RestRequest): Promise<Actor[]> {
    const result = await firstValueFrom(
      this.http.post<RestResult>(`/api/v1/campaigns/${campaignId}/rests`, input),
    );
    return result.actors;
  }

  public async previewLevelUp(actorId: string, input: LevelUpInput): Promise<LevelUpPreview> {
    return firstValueFrom(
      this.http.post<LevelUpPreview>(`/api/v1/actors/${actorId}/level-up/preview`, input),
    );
  }

  public async levelUp(actorId: string, input: LevelUpInput): Promise<LevelUpResult> {
    return firstValueFrom(
      this.http.post<LevelUpResult>(`/api/v1/actors/${actorId}/level-up`, input),
    );
  }
}
