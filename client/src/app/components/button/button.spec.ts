import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Button] });
  });

  it('inoltra gli attributi ARIA sul bottone nativo', () => {
    const fixture = TestBed.createComponent(Button);
    fixture.componentRef.setInput('ariaLabel', 'Apri filtri');
    fixture.componentRef.setInput('ariaPressed', true);
    fixture.componentRef.setInput('ariaExpanded', false);
    fixture.componentRef.setInput('ariaControls', 'filtri-pannello');
    fixture.detectChanges();

    const button = (fixture.nativeElement as HTMLElement).querySelector('button');
    expect(button?.getAttribute('aria-label')).toBe('Apri filtri');
    expect(button?.getAttribute('aria-pressed')).toBe('true');
    expect(button?.getAttribute('aria-expanded')).toBe('false');
    expect(button?.getAttribute('aria-controls')).toBe('filtri-pannello');
  });

  it('non aggiunge attributi ARIA quando sono null', () => {
    const fixture = TestBed.createComponent(Button);
    fixture.detectChanges();

    const button = (fixture.nativeElement as HTMLElement).querySelector('button');
    expect(button?.hasAttribute('aria-label')).toBe(false);
    expect(button?.hasAttribute('aria-pressed')).toBe(false);
    expect(button?.hasAttribute('aria-expanded')).toBe(false);
    expect(button?.hasAttribute('aria-controls')).toBe(false);
  });

  it('inoltra disabled e non emette pressed quando disabilitato', () => {
    const fixture = TestBed.createComponent(Button);
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();

    const button = (fixture.nativeElement as HTMLElement).querySelector('button');
    const emit = vi.fn();
    fixture.componentInstance.pressed.subscribe(emit);
    button?.click();

    expect(button?.disabled).toBe(true);
    expect(emit).not.toHaveBeenCalled();
  });

  it('emette pressed al click quando abilitato', () => {
    const fixture = TestBed.createComponent(Button);
    fixture.detectChanges();

    const button = (fixture.nativeElement as HTMLElement).querySelector('button');
    const emit = vi.fn();
    fixture.componentInstance.pressed.subscribe(emit);
    button?.click();

    expect(button?.disabled).toBe(false);
    expect(emit).toHaveBeenCalledTimes(1);
  });
});
