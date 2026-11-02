import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { DiceOverlayComponent } from './dice-overlay.component';

describe('DiceOverlayComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DiceOverlayComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('collega aria-labelledby al titolo del dialog nonostante host display: contents', () => {
    const fixture = TestBed.createComponent(DiceOverlayComponent);
    fixture.componentRef.setInput('campaignId', 'campaign-1');
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const dialog = root.querySelector('dialog');
    const heading = root.querySelector('h2');

    expect(dialog).not.toBeNull();
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toContain('Tira dadi');
    expect(heading?.id).not.toBe('');
    expect(dialog?.getAttribute('aria-labelledby')).toBe(heading?.id);
  });
});
