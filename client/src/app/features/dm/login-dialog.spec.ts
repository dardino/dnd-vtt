import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginDialog } from './login-dialog';

describe('LoginDialog', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.open = false;
    });
    TestBed.configureTestingModule({ imports: [LoginDialog] });
  });

  const create = (options: {
    open?: boolean;
    error?: string | null;
    busy?: boolean;
  } = {}): ComponentFixture<LoginDialog> => {
    const fixture = TestBed.createComponent(LoginDialog);
    fixture.componentRef.setInput('open', options.open ?? true);
    fixture.componentRef.setInput('error', options.error ?? null);
    fixture.componentRef.setInput('busy', options.busy ?? false);
    fixture.detectChanges();
    return fixture;
  };

  const rootOf = (fixture: ComponentFixture<LoginDialog>): HTMLElement =>
    fixture.nativeElement as HTMLElement;

  const passwordInput = (fixture: ComponentFixture<LoginDialog>): HTMLInputElement => {
    const input = rootOf(fixture).querySelector('input[type="password"]');
    if (input === null) {
      throw new Error('input password non trovato');
    }
    return input as HTMLInputElement;
  };

  const submitButton = (fixture: ComponentFixture<LoginDialog>): HTMLButtonElement => {
    const button = Array.from(rootOf(fixture).querySelectorAll('button'))
      .find((entry) => entry.textContent?.trim() === 'Entra');
    if (button === undefined) {
      throw new Error('bottone Entra non trovato');
    }
    return button;
  };

  const type = (fixture: ComponentFixture<LoginDialog>, value: string): void => {
    const input = passwordInput(fixture);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  it('parte con il campo vuoto e il submit disabilitato', () => {
    const fixture = create();
    const root = rootOf(fixture);

    expect(root.textContent).toContain('Accesso alla console');
    expect(passwordInput(fixture).value).toBe('');
    expect(submitButton(fixture).disabled).toBe(true);
  });

  it('emette la password inserita al submit', () => {
    const fixture = create();
    const emitted: string[] = [];
    fixture.componentInstance.login.subscribe((value) => {
      emitted.push(value);
    });

    type(fixture, 'segreta');
    expect(submitButton(fixture).disabled).toBe(false);
    rootOf(fixture).querySelector('form')?.dispatchEvent(new Event('submit'));

    expect(emitted).toEqual(['segreta']);
  });

  it('non emette quando il campo è vuoto o busy', () => {
    const fixture = create({ busy: true });
    let emitted = 0;
    fixture.componentInstance.login.subscribe(() => {
      emitted += 1;
    });

    type(fixture, 'segreta');
    expect(submitButton(fixture).disabled).toBe(true);
    rootOf(fixture).querySelector('form')?.dispatchEvent(new Event('submit'));

    expect(emitted).toBe(0);
  });

  it('disabilita il campo quando busy', () => {
    const fixture = create({ busy: true });

    expect(passwordInput(fixture).disabled).toBe(true);
    expect(submitButton(fixture).disabled).toBe(true);
  });

  it('segnala il campo mancante al submit anche senza blur', async () => {
    const fixture = create();

    rootOf(fixture).querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.form.password().touched()).toBe(true);
    expect(rootOf(fixture).textContent).toContain('Inserisci la password DM.');
  });

  it('mostra l errore del server e lo stile locale', () => {
    const fixture = create({ error: 'Password errata.' });
    const alert = rootOf(fixture).querySelector('[role="alert"]') as HTMLElement;

    expect(alert.textContent).toContain('Password errata.');
    expect(alert.className).toBe('field-error');
  });

  it('segnala la password mancante solo dopo touched con aria-invalid e aria-describedby', () => {
    const fixture = create();
    const input = passwordInput(fixture);

    expect(rootOf(fixture).textContent).not.toContain('Inserisci la password DM.');
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    expect(input.getAttribute('aria-describedby')).toBeNull();

    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(rootOf(fixture).textContent).toContain('Inserisci la password DM.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('login-password-error');
    const alert = rootOf(fixture).querySelector('#login-password-error');
    expect(alert?.getAttribute('role')).toBe('alert');
  });

  it('azzera campo e stato all apertura', () => {
    const fixture = create();
    type(fixture, 'segreta');
    passwordInput(fixture).dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    expect(passwordInput(fixture).value).toBe('');
    expect(passwordInput(fixture).getAttribute('aria-invalid')).toBeNull();
    expect(rootOf(fixture).textContent).not.toContain('Inserisci la password DM.');
  });
});
