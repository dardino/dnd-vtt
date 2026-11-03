import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DmKeyboardController } from './dm-keyboard.controller';

const press = (init: KeyboardEventInit): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  window.dispatchEvent(event);
  return event;
};

describe('DmKeyboardController', () => {
  let controller: DmKeyboardController;
  let undo: ReturnType<typeof vi.fn<() => void>>;
  let redo: ReturnType<typeof vi.fn<() => void>>;
  let canUndo: ReturnType<typeof vi.fn<() => boolean>>;

  beforeEach(() => {
    undo = vi.fn<() => void>();
    redo = vi.fn<() => void>();
    canUndo = vi.fn<() => boolean>(() => true);
    TestBed.configureTestingModule({});
    controller = TestBed.inject(DmKeyboardController);
  });

  afterEach(() => {
    controller.detach();
  });

  it('annulla con Ctrl+Z e Meta+Z', () => {
    controller.attach({ undo, redo, canUndo });

    const ctrl = press({ key: 'z', ctrlKey: true });
    press({ key: 'z', metaKey: true });

    expect(undo).toHaveBeenCalledTimes(2);
    expect(ctrl.defaultPrevented).toBe(true);
  });

  it('annulla solo se la history lo consente', () => {
    canUndo.mockReturnValue(false);
    controller.attach({ undo, redo, canUndo });

    const event = press({ key: 'z', ctrlKey: true });

    expect(undo).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('rifà con Ctrl+Shift+Z e Ctrl+Y', () => {
    controller.attach({ undo, redo, canUndo });

    press({ key: 'Z', ctrlKey: true, shiftKey: true });
    press({ key: 'y', ctrlKey: true });

    expect(redo).toHaveBeenCalledTimes(2);
    expect(undo).not.toHaveBeenCalled();
  });

  it('ignora i tasti senza modificatore o con Alt', () => {
    controller.attach({ undo, redo, canUndo });

    press({ key: 'z' });
    press({ key: 'z', ctrlKey: true, altKey: true });

    expect(undo).not.toHaveBeenCalled();
    expect(redo).not.toHaveBeenCalled();
  });

  it('ignora i campi editabili e i dialoghi aperti', () => {
    controller.attach({ undo, redo, canUndo });

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }));
    input.remove();

    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.appendChild(dialog);
    press({ key: 'z', ctrlKey: true });
    dialog.remove();

    expect(undo).not.toHaveBeenCalled();
  });

  it('smette di ascoltare dopo il detach', () => {
    controller.attach({ undo, redo, canUndo });
    controller.detach();

    press({ key: 'z', ctrlKey: true });

    expect(undo).not.toHaveBeenCalled();
  });

  it('sostituisce gli handler a ogni attach', () => {
    const nextUndo = vi.fn<() => void>();
    controller.attach({ undo, redo, canUndo });
    controller.attach({ undo: nextUndo, redo, canUndo });

    press({ key: 'z', ctrlKey: true });

    expect(nextUndo).toHaveBeenCalledTimes(1);
    expect(undo).not.toHaveBeenCalled();
  });
});
