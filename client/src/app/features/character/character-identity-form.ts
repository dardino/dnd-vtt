import { effect, signal, untracked, type Signal } from '@angular/core';
import { form, maxLength, required } from '@angular/forms/signals';

export interface CharacterIdentityFormModel {
  name: string;
  alignment: string;
  notes: string;
}

/** Limiti condivisi tra form, template e test. */
export const IDENTITY_NAME_MAX_LENGTH = 120;
export const IDENTITY_ALIGNMENT_MAX_LENGTH = 80;
export const IDENTITY_NOTES_MAX_LENGTH = 20_000;

const emptyIdentity = (): CharacterIdentityFormModel => ({
  name: '',
  alignment: '',
  notes: '',
});

/** Form dell'identità: unico modello per passo identità, dettagli e bozza. */
export const createCharacterIdentityForm = () => form(
  signal<CharacterIdentityFormModel>(emptyIdentity()),
  (path) => {
    required(path.name, { message: 'Inserisci il nome del personaggio.' });
    maxLength(path.name, IDENTITY_NAME_MAX_LENGTH, {
      message: `Il nome non può superare ${IDENTITY_NAME_MAX_LENGTH} caratteri.`,
    });
    maxLength(path.alignment, IDENTITY_ALIGNMENT_MAX_LENGTH, {
      message: `L'allineamento non può superare ${IDENTITY_ALIGNMENT_MAX_LENGTH} caratteri.`,
    });
    maxLength(path.notes, IDENTITY_NOTES_MAX_LENGTH, {
      message: `Le note non possono superare ${IDENTITY_NOTES_MAX_LENGTH} caratteri.`,
    });
  },
);

export type CharacterIdentityForm = ReturnType<typeof createCharacterIdentityForm>;

/** Sottoinsieme dello store necessario alla sincronizzazione. */
export interface CharacterIdentityStore {
  readonly name: Signal<string>;
  readonly alignment: Signal<string>;
  readonly notes: Signal<string>;
  setName(name: string): void;
  setAlignment(alignment: string): void;
  setNotes(notes: string): void;
}

/**
 * Sincronizza il form con lo store in entrambe le direzioni.
 * Gli effect scrivono solo quando il valore cambia davvero: reset e restore
 * dello store non rientrano nel form e viceversa, senza loop di aggiornamenti.
 */
export const syncCharacterIdentity = (
  identityForm: CharacterIdentityForm,
  store: CharacterIdentityStore,
): void => {
  effect(() => {
    const value = identityForm().value();
    // Lo store si legge fuori dalle dipendenze: un restore/reset non deve
    // riattivare questo effect con il form ancora vecchio e sovrascriverlo.
    untracked(() => {
      if (value.name !== store.name()) {
        store.setName(value.name);
      }
      if (value.alignment !== store.alignment()) {
        store.setAlignment(value.alignment);
      }
      if (value.notes !== store.notes()) {
        store.setNotes(value.notes);
      }
    });
  });

  effect(() => {
    const current = identityForm().value();
    const next: CharacterIdentityFormModel = {
      name: store.name(),
      alignment: store.alignment(),
      notes: store.notes(),
    };
    if (
      current.name !== next.name
      || current.alignment !== next.alignment
      || current.notes !== next.notes
    ) {
      identityForm().reset(next);
    }
  });
};
