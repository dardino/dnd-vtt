import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FogConfirmDialog, type FogConfirmMode } from './fog-confirm-dialog';

describe('FogConfirmDialog', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.open = false;
    });
    TestBed.configureTestingModule({ imports: [FogConfirmDialog] });
  });

  const create = (options: {
    open?: boolean;
    mode?: FogConfirmMode | null;
    overrideActive?: boolean;
  } = {}): ComponentFixture<FogConfirmDialog> => {
    const fixture = TestBed.createComponent(FogConfirmDialog);
    fixture.componentRef.setInput('open', options.open ?? true);
    fixture.componentRef.setInput('mode', options.mode === undefined ? 'reveal' : options.mode);
    fixture.componentRef.setInput('overrideActive', options.overrideActive ?? false);
    fixture.detectChanges();
    return fixture;
  };

  const rootOf = (fixture: ComponentFixture<FogConfirmDialog>): HTMLElement =>
    fixture.nativeElement as HTMLElement;

  it('apre e chiude il dialog in base a open', () => {
    const open = create();
    expect(rootOf(open).querySelector('dialog')?.open).toBe(true);

    const closed = create({ open: false });
    expect(rootOf(closed).querySelector('dialog')?.open).toBe(false);
  });

  it('calcola il titolo in base alla modalità', () => {
    expect(rootOf(create({ mode: 'hide' })).querySelector('.dialog__title')?.textContent)
      .toBe('Nascondi tutta la mappa?');
    expect(rootOf(create({ mode: 'reveal' })).querySelector('.dialog__title')?.textContent)
      .toBe('Rivelare tutta la mappa?');
  });

  it('mostra testo override e testo uniforme', () => {
    const override = rootOf(create({ overrideActive: true }));
    expect(override.textContent).toContain('override temporaneo');
    expect(override.textContent).toContain('tornano con');

    const uniform = rootOf(create({ overrideActive: false }));
    expect(uniform.textContent).toContain('sostituisce la copertura corrente');
  });

  it('emette confirm e dismiss dai pulsanti', () => {
    const fixture = create();
    const confirmed = vi.fn();
    const dismissed = vi.fn();
    fixture.componentInstance.confirm.subscribe(confirmed);
    fixture.componentInstance.dismiss.subscribe(dismissed);

    const buttons = Array.from(rootOf(fixture).querySelectorAll('button'))
      .filter((button) => button.textContent?.trim() === 'Conferma' || button.textContent?.trim() === 'Annulla');
    buttons[0]?.click();
    buttons[1]?.click();

    expect(confirmed).toHaveBeenCalledTimes(1);
    expect(dismissed).toHaveBeenCalledTimes(1);
  });

  it('emette dismiss alla chiusura del dialog', () => {
    const fixture = create();
    const dismissed = vi.fn();
    fixture.componentInstance.dismiss.subscribe(dismissed);

    (rootOf(fixture).querySelector('.dialog__close') as HTMLButtonElement).click();

    expect(dismissed).toHaveBeenCalledTimes(1);
  });
});
