import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { CharacterWizardStore } from './character-wizard.store';

const PREVIEW_URL = '/api/v1/actors/preview';

describe('CharacterWizardStore.reset', () => {
  let store: InstanceType<typeof CharacterWizardStore>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(CharacterWizardStore);
    http = TestBed.inject(HttpTestingController);
  });

  it('riporta step, identità e build allo stato iniziale', () => {
    store.setName('Aria');
    store.setAlignment('Caotico Buono');
    store.setNotes('Nota del DM');
    store.next();
    store.next();
    store.setAbilityMethod('standardArray');
    store.applyRolledStats([15, 14, 13, 12, 10, 8], 'roll-1');

    store.reset();

    expect(store.step()).toBe(0);
    expect(store.name()).toBe('');
    expect(store.alignment()).toBe('');
    expect(store.notes()).toBe('');
    expect(store.build().level).toBe(1);
    expect(store.build().classId).toBe('');
    expect(store.build().speciesId).toBe('');
    expect(store.build().backgroundId).toBe('');
    expect(store.build().abilityGeneration).toEqual({
      method: 'pointBuy',
      base: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 },
    });
    expect(store.build().equipment).toEqual([]);
    expect(store.build().budgetGp).toBe(0);
    expect(store.build().proficiencies).toEqual({
      classSkills: [],
      speciesSkills: [],
      expertise: [],
      tools: [],
      languages: [],
    });
    expect(store.build().spells).toEqual({
      cantrips: [],
      known: [],
      prepared: [],
      spellbook: [],
    });
    expect(store.preview()).toBeNull();
    expect(store.checking()).toBe(false);
    expect(store.checkError()).toBeNull();
  });

  it('mostra un PG pulito quando si rientra nel wizard senza bozza', () => {
    store.setName('Aria');
    store.setAlignment('Legale Neutrale');
    store.setAbilityMethod('standardArray');

    // Flusso di `ngOnInit`: reset prima di `restore()`; senza bozza non si ripristina nulla.
    store.reset();

    const reopened = TestBed.inject(CharacterWizardStore);
    expect(reopened.name()).toBe('');
    expect(reopened.alignment()).toBe('');
    expect(reopened.build().abilityGeneration.method).toBe('pointBuy');
    expect(reopened.step()).toBe(0);
  });

  it('riapplica la bozza valida dopo il reset', () => {
    store.setName('Aria');
    store.setAbilityMethod('standardArray');

    store.reset();
    store.restoreDraft({
      step: 3,
      name: 'Borin',
      alignment: 'Legale Buono',
      notes: 'bozza',
      build: store.build(),
    });

    expect(store.step()).toBe(3);
    expect(store.name()).toBe('Borin');
    expect(store.alignment()).toBe('Legale Buono');
    expect(store.notes()).toBe('bozza');
  });

  it('pulisce l’anteprima del server e l’errore di verifica', async () => {
    const validated = store.checkBuild();
    http.expectOne(PREVIEW_URL).flush({ ok: true, errors: [], warnings: [] });
    await validated;
    expect(store.preview()).not.toBeNull();

    store.reset();
    expect(store.preview()).toBeNull();
    expect(store.checking()).toBe(false);
    expect(store.checkError()).toBeNull();

    const failing = store.checkBuild();
    http.expectOne(PREVIEW_URL).flush('errore', { status: 500, statusText: 'Server Error' });
    await failing;
    expect(store.checkError()).not.toBeNull();

    store.reset();
    expect(store.checkError()).toBeNull();
    expect(store.checking()).toBe(false);
    http.verify();
  });
});
