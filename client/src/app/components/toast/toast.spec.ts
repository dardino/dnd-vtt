import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ToastService } from '../../core/ui/toast.service';
import { Toast } from './toast';

describe('Toast', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Toast] });
  });

  it("chiude la notifica con l'icona", () => {
    const service = TestBed.inject(ToastService);
    const fixture = TestBed.createComponent(Toast);
    fixture.detectChanges();

    service.show('Messaggio', 'success', 0);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const close = element.querySelector<HTMLButtonElement>('.toast__close');

    expect(close?.textContent).toContain('close');
    expect(close?.getAttribute('aria-label')).toBe('Chiudi notifica');

    close?.click();
    fixture.detectChanges();

    expect(element.querySelector('.toast')).toBeNull();
  });
});
