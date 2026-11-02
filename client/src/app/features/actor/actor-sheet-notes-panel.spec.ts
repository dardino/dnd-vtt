import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ActorSheetNotesPanel } from './actor-sheet-notes-panel';

describe('ActorSheetNotesPanel', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ActorSheetNotesPanel] });
  });

  const create = (options: {
    notes?: string;
    saving?: boolean;
    saved?: boolean;
  } = {}) => {
    const fixture = TestBed.createComponent(ActorSheetNotesPanel);
    fixture.componentRef.setInput('notes', options.notes ?? '');
    fixture.componentRef.setInput('saving', options.saving ?? false);
    fixture.componentRef.setInput('saved', options.saved ?? false);
    fixture.detectChanges();
    return fixture;
  };

  it('mostra le note correnti nel textarea', () => {
    const fixture = create({ notes: 'Il ponte è crollato.' });
    const root = fixture.nativeElement as HTMLElement;

    expect((root.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Il ponte è crollato.');
    expect(root.textContent).toContain('Note del DM');
    expect(root.textContent).toContain('Queste note non vengono mai inviate alla scheda giocatore.');
  });

  it('emette notesChange quando si scrive', () => {
    const fixture = create();
    const root = fixture.nativeElement as HTMLElement;
    const changes: string[] = [];
    fixture.componentInstance.notesChange.subscribe((value) => changes.push(value));

    const textarea = root.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = 'Nuova nota';
    textarea.dispatchEvent(new Event('input'));

    expect(changes).toEqual(['Nuova nota']);
  });

  it('emette save dal pulsante principale', () => {
    const fixture = create();
    const root = fixture.nativeElement as HTMLElement;
    const saves: number[] = [];
    fixture.componentInstance.save.subscribe(() => saves.push(1));

    (root.querySelector('button') as HTMLButtonElement).click();

    expect(saves).toEqual([1]);
  });

  it('mostra salvataggio in corso e conferma', () => {
    const saving = create({ saving: true });
    const savingRoot = saving.nativeElement as HTMLElement;
    const savingButton = savingRoot.querySelector('button') as HTMLButtonElement;
    expect(savingButton.textContent).toContain('Salvataggio…');
    expect(savingButton.disabled).toBe(true);

    const saved = create({ saved: true });
    expect((saved.nativeElement as HTMLElement).textContent).toContain('Salvate.');
  });
});
