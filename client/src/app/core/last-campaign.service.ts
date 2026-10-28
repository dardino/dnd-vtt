import { Injectable } from '@angular/core';

const STORAGE_KEY = 'dnd-vtt.lastCampaignId';

@Injectable({ providedIn: 'root' })
export class LastCampaignService {
  public read(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  public write(campaignId: string): void {
    try {
      localStorage.setItem(STORAGE_KEY, campaignId);
    } catch {
      // localStorage può essere disabilitato: si riparte dalla scelta campagna
    }
  }

  public clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // nulla da fare: il valore non verrà letto
    }
  }
}
