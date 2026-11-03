import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { DiceStore } from '../../core/dice.store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiceOverlayComponent } from './dice-overlay.component';

describe('DiceOverlayComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DiceOverlayComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  const create = (): ComponentFixture<DiceOverlayComponent> => {
    const fixture = TestBed.createComponent(DiceOverlayComponent);
    fixture.componentRef.setInput('campaignId', 'campaign-1');
    fixture.detectChanges();
    return fixture;
  };

  const formulaInput = (fixture: ComponentFixture<DiceOverlayComponent>): HTMLInputElement =>
    (fixture.nativeElement as HTMLElement).querySelector('input[type="text"]') as HTMLInputElement;

  it('collega aria-labelledby al titolo del dialog nonostante host display: contents', () => {
    const fixture = create();

    const root = fixture.nativeElement as HTMLElement;
    const dialog = root.querySelector('dialog');
    const heading = root.querySelector('h2');

    expect(dialog).not.toBeNull();
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toContain('Tira dadi');
    expect(heading?.id).not.toBe('');
    expect(dialog?.getAttribute('aria-labelledby')).toBe(heading?.id);
  });

  it('blocca il submit quando la formula non è valida', async () => {
    const fixture = create();
    const roll = vi.spyOn(TestBed.inject(DiceStore), 'roll').mockResolvedValue(null);
    const input = formulaInput(fixture);

    input.value = 'd20';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(fixture.componentInstance.diceForm.formula().valid()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('La formula deve avere la forma');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('dice-formula-error');

    await fixture.componentInstance.roll();

    expect(roll).not.toHaveBeenCalled();
  });

  it('invia tramite submit la formula valida', async () => {
    const fixture = create();
    const roll = vi.spyOn(TestBed.inject(DiceStore), 'roll').mockResolvedValue(null);
    const input = formulaInput(fixture);

    input.value = '2d6+3';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    await fixture.componentInstance.roll();

    expect(roll).toHaveBeenCalledWith('campaign-1', expect.objectContaining({ formula: '2d6+3' }));
  });
});
