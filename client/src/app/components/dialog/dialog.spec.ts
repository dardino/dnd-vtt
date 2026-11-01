import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Dialog } from './dialog';

/**
 * jsdom non implementa l'API modale di `<dialog>`: il polyfill qui sotto
 * riproduce il comportamento essenziale del browser (attributo `open` +
 * evento `close`), così i test coprono gli handler reali del componente.
 */
const installDialogPolyfill = (): void => {
  HTMLDialogElement.prototype.showModal = function showModal(): void {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(): void {
    if (!this.open) {
      return;
    }
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
};

describe('Dialog', () => {
  beforeEach(() => {
    installDialogPolyfill();
    TestBed.configureTestingModule({ imports: [Dialog] });
  });

  const create = (dismissible = true) => {
    const fixture = TestBed.createComponent(Dialog);
    fixture.componentRef.setInput('title', 'Titolo di prova');
    fixture.componentRef.setInput('dismissible', dismissible);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    return fixture;
  };

  it('collega aria-labelledby al titolo renderizzato', () => {
    const fixture = create();
    const element = fixture.nativeElement as HTMLElement;
    const dialog = element.querySelector('dialog');
    const heading = element.querySelector('h2');

    expect(dialog).not.toBeNull();
    expect(heading).not.toBeNull();
    expect(dialog?.getAttribute('aria-labelledby')).toBe(heading?.id);
    expect(heading?.textContent).toContain('Titolo di prova');
  });

  it('emette closed una sola volta su Esc', () => {
    const fixture = create();
    const dialog = (fixture.nativeElement as HTMLElement).querySelector('dialog');
    let emitted = 0;
    fixture.componentInstance.closed.subscribe(() => {
      emitted += 1;
    });

    const cancel = new Event('cancel', { cancelable: true });
    dialog?.dispatchEvent(cancel);
    fixture.detectChanges();

    expect(cancel.defaultPrevented).toBe(true);
    expect(emitted).toBe(1);
    expect(dialog?.open).toBe(false);
  });

  it('non emette closed quando la chiusura arriva dal genitore', () => {
    const fixture = create();
    let emitted = 0;
    fixture.componentInstance.closed.subscribe(() => {
      emitted += 1;
    });

    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();

    expect(emitted).toBe(0);
  });

  it('con dismissible=false Esc non chiude né emette closed', () => {
    const fixture = create(false);
    const dialog = (fixture.nativeElement as HTMLElement).querySelector('dialog');
    let emitted = 0;
    fixture.componentInstance.closed.subscribe(() => {
      emitted += 1;
    });

    const cancel = new Event('cancel', { cancelable: true });
    dialog?.dispatchEvent(cancel);
    fixture.detectChanges();

    expect(cancel.defaultPrevented).toBe(true);
    expect(emitted).toBe(0);
    expect(dialog?.open).toBe(true);
  });
});
