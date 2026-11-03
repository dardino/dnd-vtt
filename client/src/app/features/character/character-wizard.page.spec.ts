import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { SrdCatalog } from '@dnd-vtt/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SrdCatalogService } from '../../core/services/srd-catalog.service';
import {
  IDENTITY_ALIGNMENT_MAX_LENGTH,
  IDENTITY_NAME_MAX_LENGTH,
  IDENTITY_NOTES_MAX_LENGTH,
} from './character-identity-form';
import { CharacterWizardPage } from './character-wizard.page';
import { CharacterWizardStore } from './character-wizard.store';

const DRAFT_KEY = 'dnd-vtt.wizard.demo.v1';

const fakeCatalogService = () => ({
  catalog: signal<SrdCatalog | null>(null),
  loading: signal(false),
  error: signal<string | null>(null),
  load: (): Promise<void> => Promise.resolve(),
});

describe('CharacterWizardPage', () => {
  let store: InstanceType<typeof CharacterWizardStore>;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [CharacterWizardPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SrdCatalogService, useValue: fakeCatalogService() },
        { provide: Router, useValue: { navigate: vi.fn(() => Promise.resolve(true)) } },
      ],
    });
    store = TestBed.inject(CharacterWizardStore);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('azzera il PG precedente al primo ingresso senza bozza', async () => {
    store.setName('Aria');
    store.setAlignment('Caotico Buono');
    store.setNotes('nota del PG precedente');
    store.setStep(4);
    store.applyRolledStats([15, 14, 13, 12, 10, 8], 'roll-1');

    const fixture = TestBed.createComponent(CharacterWizardPage);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.store.name()).toBe('');
    expect(fixture.componentInstance.store.alignment()).toBe('');
    expect(fixture.componentInstance.store.notes()).toBe('');
    expect(fixture.componentInstance.store.step()).toBe(0);
    expect(fixture.componentInstance.store.build().abilityGeneration.method).toBe('pointBuy');
    expect(fixture.componentInstance.store.build().equipment).toEqual([]);
  });

  it('riapplica la bozza valida dopo il reset di ingresso', async () => {
    store.reset();
    const draft = {
      version: 1,
      savedAt: '2026-11-01T10:00:00.000Z',
      step: 3,
      name: 'Borin',
      alignment: 'Legale Buono',
      notes: 'bozza',
      build: { ...store.build(), classId: 'fighter' },
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));

    // Store sporco dell'ultimo PG: il reset deve avvenire prima del restore.
    store.setName('Aria');
    store.setNotes('sporca');
    store.setStep(0);

    const fixture = TestBed.createComponent(CharacterWizardPage);
    fixture.detectChanges();
    // `initialize()` è asincrono: si attende che `restore()` abbia applicato la bozza.
    await vi.waitFor(() => {
      expect(fixture.componentInstance.store.name()).toBe('Borin');
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.store.alignment()).toBe('Legale Buono');
    expect(fixture.componentInstance.store.notes()).toBe('bozza');
    expect(fixture.componentInstance.store.step()).toBe(3);
    expect(fixture.componentInstance.store.build().classId).toBe('fighter');
    expect(fixture.componentInstance.identityForm.name().value()).toBe('Borin');
  });

  const createPage = async (): Promise<ComponentFixture<CharacterWizardPage>> => {
    const fixture = TestBed.createComponent(CharacterWizardPage);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  };

  it('valida nome vuoto e limiti di lunghezza dei campi identità', async () => {
    const fixture = await createPage();
    const page = fixture.componentInstance;

    expect(page.identityForm.name().value()).toBe('');
    expect(page.identityForm.name().invalid()).toBe(true);
    expect(page.identityForm.name().errors()[0]?.message)
      .toBe('Inserisci il nome del personaggio.');
    expect(page.canSave()).toBe(false);

    page.identityForm.name().value.set('a'.repeat(IDENTITY_NAME_MAX_LENGTH + 1));
    expect(page.identityForm.name().invalid()).toBe(true);
    expect(page.identityForm.name().errors()[0]?.message)
      .toContain(String(IDENTITY_NAME_MAX_LENGTH));

    page.identityForm.name().value.set('a'.repeat(IDENTITY_NAME_MAX_LENGTH));
    expect(page.identityForm.name().valid()).toBe(true);

    page.identityForm.alignment().value.set('a'.repeat(IDENTITY_ALIGNMENT_MAX_LENGTH + 1));
    expect(page.identityForm.alignment().invalid()).toBe(true);

    page.identityForm.notes().value.set('a'.repeat(IDENTITY_NOTES_MAX_LENGTH + 1));
    expect(page.identityForm.notes().invalid()).toBe(true);
    page.identityForm.notes().value.set('');
    expect(page.identityForm.notes().valid()).toBe(true);
  });

  it('sincronizza form e store in entrambe le direzioni su modifica e reset', async () => {
    const fixture = await createPage();
    const page = fixture.componentInstance;

    store.restoreDraft({
      step: 5,
      name: 'Borin',
      alignment: 'Legale Buono',
      notes: 'bozza',
      build: store.build(),
    });
    fixture.detectChanges();

    expect(page.identityForm().value()).toEqual({
      name: 'Borin',
      alignment: 'Legale Buono',
      notes: 'bozza',
    });

    page.identityForm.name().value.set('Aria');
    page.identityForm.alignment().value.set('Neutrale');
    page.identityForm.notes().value.set('nuova nota');
    fixture.detectChanges();

    expect(store.name()).toBe('Aria');
    expect(store.alignment()).toBe('Neutrale');
    expect(store.notes()).toBe('nuova nota');

    store.reset();
    fixture.detectChanges();

    expect(page.identityForm().value()).toEqual({ name: '', alignment: '', notes: '' });
    expect(page.identityForm.name().dirty()).toBe(false);
    expect(page.identityForm.name().touched()).toBe(false);
  });

  it('segna dirty/touched e applica aria-invalid con errore accessibile dopo il blur', async () => {
    const fixture = await createPage();
    const page = fixture.componentInstance;
    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector(
      'input[placeholder="Es. Kaelen Ombraverde"]',
    ) as HTMLInputElement;

    input.value = 'Kaelen';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(page.identityForm.name().dirty()).toBe(true);
    expect(page.identityForm.name().touched()).toBe(false);
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    expect(input.hasAttribute('aria-describedby')).toBe(false);
    expect(store.name()).toBe('Kaelen');

    input.value = '';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(page.identityForm.name().touched()).toBe(true);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('character-name-error');
    expect(root.querySelector('#character-name-error')?.textContent)
      .toContain('Inserisci il nome del personaggio.');
    expect(root.querySelector('#character-name-error')?.getAttribute('role')).toBe('alert');
  });
});
