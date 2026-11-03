import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Asset } from '@dnd-vtt/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AssetService } from './asset.service';

const ASSET_ID = '0199c0de-0000-7000-8000-000000000001';

const asset = (): Asset => ({
  id: ASSET_ID,
  hash: 'a'.repeat(64),
  mime: 'image/png',
  bytes: 1024,
  width: 64,
  height: 64,
  url: '/uploads/webp/a.webp',
  previewUrl: '/uploads/previews/a.webp',
  thumbUrl: '/uploads/thumbs/a.webp',
  createdAt: '2026-11-03T00:00:00.000Z',
});

describe('AssetService', () => {
  let service: AssetService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AssetService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('condivide una sola richiesta per lo stesso asset', async () => {
    const first = service.get(ASSET_ID);
    const second = service.get(ASSET_ID);

    const request = http.expectOne(`/api/v1/assets/${ASSET_ID}`);
    request.flush(asset());

    expect(await first).toEqual(asset());
    expect(await second).toEqual(asset());
  });

  it('non memorizza gli errori e consente un nuovo tentativo', async () => {
    const failed = service.get(ASSET_ID);
    http.expectOne(`/api/v1/assets/${ASSET_ID}`).flush('boom', {
      status: 500,
      statusText: 'Server Error',
    });
    await expect(failed).rejects.toBeTruthy();

    const retry = service.get(ASSET_ID);
    http.expectOne(`/api/v1/assets/${ASSET_ID}`).flush(asset());

    expect(await retry).toEqual(asset());
  });
});
