import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { AiStatus, StatblockParseResult } from '@dnd-vtt/shared';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AiService {
  private readonly http = inject(HttpClient);

  public async status(): Promise<AiStatus> {
    return firstValueFrom(this.http.get<AiStatus>('/api/v1/ai/status'));
  }

  public async parseStatblock(campaignId: string, text: string): Promise<StatblockParseResult> {
    return firstValueFrom(
      this.http.post<StatblockParseResult>(
        `/api/v1/campaigns/${campaignId}/parse/statblock`,
        { text },
      ),
    );
  }
}
