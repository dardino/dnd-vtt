import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, maxLength, type FieldTree } from '@angular/forms/signals';
import { beforeEach, describe, expect, it } from 'vitest';
import { ActorSheetNotesPanel } from './actor-sheet-notes-panel';

const NOTES_MAX_LENGTH = 20000;

const createField = (value: string, max = NOTES_MAX_LENGTH): FieldTree<string> => {
  const notesForm = TestBed.runInInjectionContext(() =>
    form(signal({ notes: value }), (path) => {
      maxLength(path.notes, max, {
        message: `Le note non possono superare ${max} caratteri.`,
      });
    }));
  return notesForm.notes;
};

describe('ActorSheetNotesPanel', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ActorSheetNotesPanel] });
  });

  const create = (options: {
    field?: FieldTree<string>;
    saving?: boolean;
    saved?: boolean;
  } = {}) => {
    const fixture = TestBed.createComponent(ActorSheetNotesPanel);
    fixture.componentRef.setInput('field', options.field ?? createField(''));
    fixture.componentRef.setInput('saving', options.saving ?? false);
    fixture.componentRef.setInput('saved', options.saved ?? false);
    fixture.detectChanges();
    return fixture;
  };

  const textareaOf = (fixture: ReturnType<typeof create>): HTMLTextAreaElement =>
    (fixture.nativeElement as HTMLElement).querySelector('textarea') as HTMLTextAreaElement;

  const typeInto = (textarea: HTMLTextAreaElement, value: string): void => {
    textarea.value = value;
    textarea.dispatchEvent(new Event('input'));
  };

  it('mostra le note correnti e il conteggio caratteri', () => {
    const fixture = create({ field: createField('Il ponte è crollato.') });
    const root = fixture.nativeElement as HTMLElement;

    expect(textareaOf(fixture).value).toBe('Il ponte è crollato.');
    expect(root.textContent).toContain('Note del DM');
    expect(root.textContent).toContain('Queste note non vengono mai inviate alla scheda giocatore.');
    expect(root.textContent).toContain('20 / 20000 caratteri');
  });

  it('scrive nel campo del form e lo marca dirty', () => {
    const field = createField('');
    const fixture = create({ field });

    typeInto(textareaOf(fixture), 'Nuova nota');
    fixture.detectChanges();

    expect(field().value()).toBe('Nuova nota');
    expect(field().dirty()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('10 / 20000 caratteri');
  });

  it('mostra l errore di lunghezza solo dopo touched e aggiorna la a11y', () => {
    const field = createField('', 5);
    const fixture = create({ field });
    const root = fixture.nativeElement as HTMLElement;
    const textarea = textareaOf(fixture);

    typeInto(textarea, 'troppo lunga');
    fixture.detectChanges();

    expect(field().invalid()).toBe(true);
    expect(root.textContent).not.toContain('Le note non possono superare 5 caratteri.');
    expect(textarea.hasAttribute('aria-invalid')).toBe(false);
    expect(textarea.getAttribute('aria-describedby')).toBe('dm-notes-counter');

    textarea.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(field().touched()).toBe(true);
    expect(root.textContent).toContain('Le note non possono superare 5 caratteri.');
    expect(textarea.getAttribute('aria-invalid')).toBe('true');
    expect(textarea.getAttribute('aria-describedby')).toBe('dm-notes-counter dm-notes-error');
  });

  it('emette save dal pulsante principale', () => {
    const fixture = create();
    const saves: number[] = [];
    fixture.componentInstance.save.subscribe(() => saves.push(1));

    ((fixture.nativeElement as HTMLElement).querySelector('button') as HTMLButtonElement).click();

    expect(saves).toEqual([1]);
  });

  it('mostra salvataggio in corso e conferma', () => {
    const saving = create({ saving: true });
    const savingButton = (saving.nativeElement as HTMLElement).querySelector(
      'button',
    ) as HTMLButtonElement;
    expect(savingButton.textContent).toContain('Salvataggio…');
    expect(savingButton.disabled).toBe(true);

    const saved = create({ saved: true });
    expect((saved.nativeElement as HTMLElement).textContent).toContain('Salvate.');
  });
});
