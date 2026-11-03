import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ApplicationRef, ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SrdCatalogService, SRD_VERSION } from './srd-catalog.service';
import { ToastService } from './toast.service';

const meta = {
  version: SRD_VERSION,
  license: {
    key: 'CC-BY-4.0' as const,
    name: 'Creative Commons Attribution 4.0',
    url: 'https://creativecommons.org/licenses/by/4.0/',
  },
  source: {
    name: 'System Reference Document 5.2',
    url: 'https://example.com/srd',
    importedFrom: 'test',
    importedAt: '2026-11-03T00:00:00.000Z',
  },
  counts: {},
};

const srdResponse = (url: string): unknown =>
  url === '/api/v1/srd/meta' ? meta : [];

describe('SrdCatalogService', () => {
  const handleError = vi.fn();
  const get = vi.fn((url: string) => of(srdResponse(url)));
  let toasts: ToastService;
  let service: SrdCatalogService;

  beforeEach(() => {
    handleError.mockReset();
    get.mockReset();
    get.mockImplementation((url: string) => of(srdResponse(url)));
    TestBed.configureTestingModule({
      providers: [
        { provide: HttpClient, useValue: { get } },
        { provide: ErrorHandler, useValue: { handleError } },
      ],
    });
    toasts = TestBed.inject(ToastService);
    service = TestBed.inject(SrdCatalogService);
  });

  afterEach(() => {
    for (const toast of toasts.toasts()) {
      toasts.dismiss(toast.id);
    }
    TestBed.resetTestingModule();
  });

  const flush = async (loading: Promise<void>): Promise<void> => {
    TestBed.tick();
    await TestBed.inject(ApplicationRef).whenStable();
    await loading;
    TestBed.tick();
  };

  it('carica il catalogo una volta e mantiene load() idempotente', async () => {
    const first = service.load();
    await flush(first);

    expect(service.catalog()).toMatchObject({
      meta: { version: SRD_VERSION, name: 'System Reference Document 5.2' },
      classes: [],
      monsters: [],
    });
    expect(service.loading()).toBe(false);
    expect(service.error()).toBeNull();
    expect(get).toHaveBeenCalledTimes(8);

    await service.load();
    expect(get).toHaveBeenCalledTimes(8);
  });

  it('espone l’errore, mostra un toast e consente un nuovo tentativo', async () => {
    const failure = new HttpErrorResponse({ status: 500 });
    get.mockImplementation(() => throwError(() => failure));

    const failed = service.load();
    await flush(failed);

    expect(service.catalog()).toBeNull();
    expect(service.loading()).toBe(false);
    expect(service.error()).toBe('Impossibile caricare i cataloghi SRD');
    expect(handleError).not.toHaveBeenCalled();
    expect(toasts.toasts()).toEqual([
      expect.objectContaining({ message: 'Impossibile caricare i cataloghi SRD', kind: 'error' }),
    ]);

    get.mockImplementation((url: string) => of(srdResponse(url)));
    const retry = service.load();
    await flush(retry);

    expect(service.catalog()).not.toBeNull();
    expect(service.error()).toBeNull();
  });
});
