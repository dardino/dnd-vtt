import { HttpErrorResponse } from '@angular/common/http';
import { ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalErrorHandler, UNHANDLED_ERROR_MESSAGE } from './error-handler';
import { ToastService } from './toast.service';

describe('GlobalErrorHandler', () => {
  let handler: ErrorHandler;
  let toasts: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: ErrorHandler, useClass: GlobalErrorHandler }],
    });
    handler = TestBed.inject(ErrorHandler);
    toasts = TestBed.inject(ToastService);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('mostra un toast e logga gli errori non HTTP', () => {
    const error = new Error('boom');

    handler.handleError(error);

    expect(console.error).toHaveBeenCalledWith(error);
    expect(toasts.toasts()).toEqual([
      expect.objectContaining({ message: UNHANDLED_ERROR_MESSAGE, kind: 'error' }),
    ]);
  });

  it('logga ma non duplica gli errori HTTP già tradotti', () => {
    const error = new HttpErrorResponse({ status: 500 });

    handler.handleError(error);

    expect(console.error).toHaveBeenCalledWith(error);
    expect(toasts.toasts()).toHaveLength(0);
  });
});
