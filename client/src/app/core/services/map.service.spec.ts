import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  emptyMapDocumentV2,
  type Map,
  type MapDocument,
} from '@dnd-vtt/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MapService } from './map.service';

const MAP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const THUMB_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const COMPOSITE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const doc = (): MapDocument => emptyMapDocumentV2('Mappa', null, 800, 600);

const savedMap = (document: MapDocument): Map => ({
  ...document,
  id: MAP_ID,
  campaignId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  imageAssetId: null,
  thumbAssetId: null,
  compositeAssetId: null,
  version: 4,
  createdAt: '2026-11-04T00:00:00.000Z',
  updatedAt: '2026-11-04T00:00:00.000Z',
});

describe('MapService.save', () => {
  let service: MapService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MapService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('mantiene il PUT storico senza campi derivati', async () => {
    const document = doc();
    const pending = service.save(MAP_ID, 3, document);

    const request = http.expectOne(`/api/v1/maps/${MAP_ID}`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ version: 3, document });
    request.flush(savedMap(document));

    await expect(pending).resolves.toEqual(savedMap(document));
  });

  it('invia thumb e composito fuori dal documento quando sono presenti', async () => {
    const document = doc();
    const pending = service.save(MAP_ID, 3, document, {
      thumbAssetId: THUMB_ID,
      compositeAssetId: COMPOSITE_ID,
    });

    const request = http.expectOne(`/api/v1/maps/${MAP_ID}`);
    expect(request.request.body).toEqual({
      version: 3,
      document,
      thumbAssetId: THUMB_ID,
      compositeAssetId: COMPOSITE_ID,
    });
    expect(request.request.body.document).not.toHaveProperty('thumbAssetId');
    expect(request.request.body.document).not.toHaveProperty('compositeAssetId');
    request.flush(savedMap(document));

    await pending;
  });

  it('invia solo il derivato disponibile in caso di fallimento parziale', async () => {
    const document = doc();
    const pending = service.save(MAP_ID, 3, document, {
      compositeAssetId: COMPOSITE_ID,
    });

    const request = http.expectOne(`/api/v1/maps/${MAP_ID}`);
    expect(request.request.body).toEqual({
      version: 3,
      document,
      compositeAssetId: COMPOSITE_ID,
    });
    expect(request.request.body).not.toHaveProperty('thumbAssetId');
    request.flush(savedMap(document));

    await pending;
  });

  it('trasmette null per azzerare esplicitamente i riferimenti', async () => {
    const document = doc();
    const pending = service.save(MAP_ID, 3, document, {
      thumbAssetId: null,
      compositeAssetId: null,
    });

    const request = http.expectOne(`/api/v1/maps/${MAP_ID}`);
    expect(request.request.body).toEqual({
      version: 3,
      document,
      thumbAssetId: null,
      compositeAssetId: null,
    });
    request.flush(savedMap(document));

    await pending;
  });
});
