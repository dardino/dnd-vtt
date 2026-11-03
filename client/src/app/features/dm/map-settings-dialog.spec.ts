import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MapSettingsDialog } from './map-settings-dialog';

describe('MapSettingsDialog', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.open = false;
    });
    TestBed.configureTestingModule({ imports: [MapSettingsDialog] });
  });

  const create = (options: { open?: boolean } = {}): ComponentFixture<MapSettingsDialog> => {
    const fixture = TestBed.createComponent(MapSettingsDialog);
    fixture.componentRef.setInput('open', options.open ?? true);
    fixture.componentRef.setInput('unit', 'imperial');
    fixture.componentRef.setInput('brushCells', 3);
    fixture.componentRef.setInput('pencilTenths', 2);
    fixture.componentRef.setInput('brushDiameterPx', 210);
    fixture.componentRef.setInput('pencilWidthPx', 14);
    fixture.detectChanges();
    return fixture;
  };

  const rootOf = (fixture: ComponentFixture<MapSettingsDialog>): HTMLElement =>
    fixture.nativeElement as HTMLElement;

  const buttons = (fixture: ComponentFixture<MapSettingsDialog>): HTMLButtonElement[] =>
    Array.from(rootOf(fixture).querySelectorAll('button'));

  it('apre e chiude il dialog in base a open', () => {
    expect(rootOf(create()).querySelector('dialog')?.open).toBe(true);
    expect(rootOf(create({ open: false })).querySelector('dialog')?.open).toBe(false);
  });

  it('mostra unità, valori e diametri correnti', () => {
    const fixture = create();
    const root = rootOf(fixture);
    const select = root.querySelector('select') as HTMLSelectElement;
    const inputs = root.querySelectorAll('input[type="number"]');

    expect(root.querySelector('.dialog__title')?.textContent).toBe('Impostazioni mappa');
    expect(select.value).toBe('imperial');
    expect(root.textContent).toContain('Anglosassone (ft)');
    expect(root.textContent).toContain('Metrica (m)');
    expect(inputs[0]?.getAttribute('min')).toBe('0.5');
    expect(inputs[0]?.getAttribute('max')).toBe('20');
    expect(inputs[0]?.getAttribute('step')).toBe('0.5');
    expect((inputs[0] as HTMLInputElement).value).toBe('3');
    expect(inputs[1]?.getAttribute('max')).toBe('10');
    expect((inputs[1] as HTMLInputElement).value).toBe('2');
    expect(root.textContent).toContain('Diametro 210 px');
    expect(root.textContent).toContain('14 px');
  });

  it('emette unità e dimensioni al cambio', () => {
    const fixture = create();
    const root = rootOf(fixture);
    const units = vi.fn();
    const brushes = vi.fn();
    const pencils = vi.fn();
    fixture.componentInstance.unitChange.subscribe(units);
    fixture.componentInstance.brushChange.subscribe(brushes);
    fixture.componentInstance.pencilChange.subscribe(pencils);

    const select = root.querySelector('select') as HTMLSelectElement;
    select.value = 'metric';
    select.dispatchEvent(new Event('change'));

    const inputs = root.querySelectorAll('input[type="number"]');
    const brush = inputs[0] as HTMLInputElement;
    brush.value = '4.5';
    brush.dispatchEvent(new Event('change'));
    const pencil = inputs[1] as HTMLInputElement;
    pencil.value = '6';
    pencil.dispatchEvent(new Event('change'));

    expect(units).toHaveBeenCalledWith('metric');
    expect(brushes).toHaveBeenCalledWith(4.5);
    expect(pencils).toHaveBeenCalledWith(6);
  });

  it('emette clearHistory e resetFog dai pulsanti danger', () => {
    const fixture = create();
    const clear = vi.fn();
    const reset = vi.fn();
    fixture.componentInstance.clearHistory.subscribe(clear);
    fixture.componentInstance.resetFog.subscribe(reset);

    const danger = buttons(fixture).filter((button) => button.classList.contains('button--danger'));
    expect(danger.map((button) => button.textContent?.trim()))
      .toEqual(['Svuota history', 'Reset FOG']);

    danger[0]?.click();
    danger[1]?.click();

    expect(clear).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('emette closed dal pulsante Chiudi impostazioni', () => {
    const fixture = create();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);

    buttons(fixture)
      .find((button) => button.textContent?.trim() === 'Chiudi impostazioni')
      ?.click();

    expect(closed).toHaveBeenCalledTimes(1);
  });
});
