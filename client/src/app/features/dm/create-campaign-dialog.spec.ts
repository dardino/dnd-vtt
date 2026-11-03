import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CreateCampaignDialog,
  type CreateCampaignValues,
} from './create-campaign-dialog';

describe('CreateCampaignDialog', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.open = false;
    });
    TestBed.configureTestingModule({ imports: [CreateCampaignDialog] });
  });

  const create = (options: {
    open?: boolean;
    busy?: boolean;
    dismissible?: boolean;
  } = {}): ComponentFixture<CreateCampaignDialog> => {
    const fixture = TestBed.createComponent(CreateCampaignDialog);
    fixture.componentRef.setInput('open', options.open ?? true);
    fixture.componentRef.setInput('busy', options.busy ?? false);
    fixture.componentRef.setInput('dismissible', options.dismissible ?? true);
    fixture.detectChanges();
    return fixture;
  };

  const rootOf = (fixture: ComponentFixture<CreateCampaignDialog>): HTMLElement =>
    fixture.nativeElement as HTMLElement;

  const nameInput = (fixture: ComponentFixture<CreateCampaignDialog>): HTMLInputElement =>
    rootOf(fixture).querySelector('input[type="text"]') as HTMLInputElement;

  const descriptionInput = (fixture: ComponentFixture<CreateCampaignDialog>): HTMLTextAreaElement =>
    rootOf(fixture).querySelector('textarea') as HTMLTextAreaElement;

  const submitButton = (fixture: ComponentFixture<CreateCampaignDialog>): HTMLButtonElement => {
    const button = Array.from(rootOf(fixture).querySelectorAll('button'))
      .find((entry) => entry.textContent?.trim() === 'Crea campagna');
    if (button === undefined) {
      throw new Error('bottone Crea campagna non trovato');
    }
    return button;
  };

  const fill = (
    fixture: ComponentFixture<CreateCampaignDialog>,
    field: 'name' | 'description',
    value: string,
  ): void => {
    const input = field === 'name' ? nameInput(fixture) : descriptionInput(fixture);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  it('parte con i campi vuoti e il submit disabilitato', () => {
    const fixture = create();
    const root = rootOf(fixture);

    expect(root.textContent).toContain('Crea campagna');
    expect(nameInput(fixture).value).toBe('');
    expect(descriptionInput(fixture).value).toBe('');
    expect(submitButton(fixture).disabled).toBe(true);
  });

  it('disabilita i campi quando busy', () => {
    const fixture = create({ busy: true });

    expect(nameInput(fixture).disabled).toBe(true);
    expect(descriptionInput(fixture).disabled).toBe(true);
    expect(submitButton(fixture).disabled).toBe(true);
  });

  it('emette i valori trimmati e la modalità scelta', () => {
    const fixture = create();
    const emitted: CreateCampaignValues[] = [];
    fixture.componentInstance.create.subscribe((values) => {
      emitted.push(values);
    });

    fill(fixture, 'name', '  E2E Campagna  ');
    fill(fixture, 'description', '  Una cava sotto la città.  ');
    const select = rootOf(fixture).querySelector('select') as HTMLSelectElement;
    select.value = 'xp';
    select.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(submitButton(fixture).disabled).toBe(false);
    rootOf(fixture).querySelector('form')?.dispatchEvent(new Event('submit'));

    expect(emitted).toEqual([{
      name: 'E2E Campagna',
      description: 'Una cava sotto la città.',
      advancementMode: 'xp',
    }]);
  });

  it('rifiuta un nome di soli spazi e lo segnala dopo touched', () => {
    const fixture = create();
    fill(fixture, 'name', '   ');
    nameInput(fixture).dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(submitButton(fixture).disabled).toBe(true);
    expect(rootOf(fixture).textContent).toContain('Inserisci il nome della campagna.');
    expect(nameInput(fixture).getAttribute('aria-invalid')).toBe('true');
    expect(nameInput(fixture).getAttribute('aria-describedby')).toBe('campaign-name-error');
    expect(rootOf(fixture).querySelector('#campaign-name-error')?.getAttribute('role')).toBe('alert');
  });

  it('limita nome e ambientazione alla lunghezza massima', () => {
    const fixture = create();

    fill(fixture, 'name', 'a'.repeat(121));
    nameInput(fixture).dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(rootOf(fixture).textContent).toContain('Il nome non può superare 120 caratteri.');
    expect(submitButton(fixture).disabled).toBe(true);

    fill(fixture, 'name', 'Cava');
    fill(fixture, 'description', 'b'.repeat(4001));
    descriptionInput(fixture).dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(rootOf(fixture).textContent).toContain('L’ambientazione non può superare 4000 caratteri.');
    expect(descriptionInput(fixture).getAttribute('aria-describedby')).toBe(
      'campaign-description-error',
    );
    expect(submitButton(fixture).disabled).toBe(true);
  });

  it('azzera modello e stato a ogni apertura', () => {
    const fixture = create();
    fill(fixture, 'name', 'Bozza');
    fill(fixture, 'description', 'Descrizione');
    nameInput(fixture).dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    expect(nameInput(fixture).value).toBe('');
    expect(descriptionInput(fixture).value).toBe('');
    expect(nameInput(fixture).getAttribute('aria-invalid')).toBeNull();
    expect(rootOf(fixture).textContent).not.toContain('Inserisci il nome della campagna.');
  });

  it('emette closed dal pulsante di chiusura quando dismissible', () => {
    const fixture = create();
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => {
      closed += 1;
    });

    const button = rootOf(fixture).querySelector('.dialog__close') as HTMLButtonElement;
    button.click();

    expect(closed).toBe(1);
  });

  it('non mostra il pulsante di chiusura quando non dismissible', () => {
    const fixture = create({ dismissible: false });

    expect(rootOf(fixture).querySelector('.dialog__close')).toBeNull();
  });
});
