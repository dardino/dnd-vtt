import { provideHttpClient, withFetch } from '@angular/common/http';
import { CSP_NONCE, ErrorHandler, provideBrowserGlobalErrorListeners } from '@angular/core';
import type { ApplicationConfig } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { GlobalErrorHandler } from './core/error-handler';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    provideHttpClient(withFetch()),
    provideRouter(routes, withComponentInputBinding()),
    {
      provide: CSP_NONCE,
      useFactory: (): string =>
        document.querySelector('meta[name="ngCspNonce"]')?.getAttribute('content') ?? '',
    },
  ],
};
