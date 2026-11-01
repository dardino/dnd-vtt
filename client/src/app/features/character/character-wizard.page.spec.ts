import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { SrdCatalog } from '@dnd-vtt/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SrdCatalogService } from '../../core/srd-catalog.service';
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

    expect(fixture.componentInstance.store.alignment()).toBe('Legale Buono');
    expect(fixture.componentInstance.store.notes()).toBe('bozza');
    expect(fixture.componentInstance.store.step()).toBe(3);
    expect(fixture.componentInstance.store.build().classId).toBe('fighter');
  });
});
