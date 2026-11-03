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

  const root = (fixture: ComponentFixture<DiceOverlayComponent>): HTMLElement =>
    fixture.nativeElement as HTMLElement;

  const formulaInput = (fixture: ComponentFixture<DiceOverlayComponent>): HTMLInputElement =>
    root(fixture).querySelector('input[type="text"]') as HTMLInputElement;

  const modifierInput = (fixture: ComponentFixture<DiceOverlayComponent>): HTMLInputElement =>
    root(fixture).querySelector('input[type="number"]') as HTMLInputElement;

  const selects = (fixture: ComponentFixture<DiceOverlayComponent>): NodeListOf<HTMLSelectElement> =>
    root(fixture).querySelectorAll<HTMLSelectElement>('select');

  const modeSelect = (fixture: ComponentFixture<DiceOverlayComponent>): HTMLSelectElement =>
    selects(fixture)[0] as HTMLSelectElement;

  const visibilitySelect = (fixture: ComponentFixture<DiceOverlayComponent>): HTMLSelectElement =>
    selects(fixture)[1] as HTMLSelectElement;

  const type = (
    fixture: ComponentFixture<DiceOverlayComponent>,
    input: HTMLInputElement,
    value: string,
  ): void => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  const choose = (
    fixture: ComponentFixture<DiceOverlayComponent>,
    select: HTMLSelectElement,
    value: string,
  ): void => {
    select.value = value;
    select.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  it('collega aria-labelledby al titolo del dialog nonostante host display: contents', () => {
    const fixture = create();

    const dialog = root(fixture).querySelector('dialog');
    const heading = root(fixture).querySelector('h2');

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

    type(fixture, input, 'd20');
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(fixture.componentInstance.diceForm.formula().valid()).toBe(false);
    expect(root(fixture).textContent).toContain('La formula deve avere la forma');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('dice-formula-error');

    await fixture.componentInstance.roll();

    expect(roll).not.toHaveBeenCalled();
  });

  it('invia tramite submit la formula valida', async () => {
    const fixture = create();
    const roll = vi.spyOn(TestBed.inject(DiceStore), 'roll').mockResolvedValue(null);
    const input = formulaInput(fixture);

    type(fixture, input, '2d6+3');

    await fixture.componentInstance.roll();

    expect(roll).toHaveBeenCalledWith('campaign-1', expect.objectContaining({ formula: '2d6+3' }));
  });

  it('invia modificatore, modo e visibilità letti dal form', async () => {
    const fixture = create();
    const roll = vi.spyOn(TestBed.inject(DiceStore), 'roll').mockResolvedValue(null);

    type(fixture, formulaInput(fixture), '2d6');
    type(fixture, modifierInput(fixture), '3');
    choose(fixture, modeSelect(fixture), 'advantage');
    choose(fixture, visibilitySelect(fixture), 'dm');

    await fixture.componentInstance.roll();

    expect(roll).toHaveBeenCalledWith('campaign-1', {
      formula: '2d6+3',
      mode: 'advantage',
      visibility: 'dm',
    });
  });

  it('blocca il submit con un modificatore non intero e lo segnala dopo il blur', async () => {
    const fixture = create();
    const roll = vi.spyOn(TestBed.inject(DiceStore), 'roll').mockResolvedValue(null);
    const input = modifierInput(fixture);

    type(fixture, formulaInput(fixture), '1d20');
    type(fixture, input, '1.5');
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(fixture.componentInstance.diceForm.modifier().invalid()).toBe(true);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('dice-modifier-error');
    expect(root(fixture).querySelector('#dice-modifier-error')?.getAttribute('role')).toBe('alert');

    await fixture.componentInstance.roll();

    expect(roll).not.toHaveBeenCalled();
  });

  it('aggiorna il campo formula con un dado rapido', () => {
    const fixture = create();
    const form = fixture.componentInstance.diceForm;
    const quick = root(fixture).querySelector('button.dice__die') as HTMLButtonElement;

    quick.click();
    fixture.detectChanges();

    expect(form.formula().value()).toBe('1d4');
    expect(formulaInput(fixture).value).toBe('1d4');
    expect(form.formula().touched()).toBe(false);
  });

  it('traccia dirty/touched e non segnala errori quando la formula è valida', () => {
    const fixture = create();
    const form = fixture.componentInstance.diceForm;
    const input = formulaInput(fixture);

    expect(form.formula().dirty()).toBe(false);
    expect(form.formula().touched()).toBe(false);

    type(fixture, input, '1d20+2');

    expect(form.formula().dirty()).toBe(true);
    expect(form.formula().touched()).toBe(false);
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    expect(input.hasAttribute('aria-describedby')).toBe(false);

    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(form.formula().touched()).toBe(true);
    expect(form.formula().valid()).toBe(true);
    expect(input.getAttribute('aria-invalid')).toBe('false');
    expect(input.hasAttribute('aria-describedby')).toBe(false);
  });
});
