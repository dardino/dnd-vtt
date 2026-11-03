import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SECTIONS, DmLayoutStore, PANEL_STORAGE_PREFIX } from './dm-layout.store';

const storageKey = (campaignId: string): string => `${PANEL_STORAGE_PREFIX}${campaignId}`;

const freshStore = (): InstanceType<typeof DmLayoutStore> => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  return TestBed.inject(DmLayoutStore);
};

describe('DmLayoutStore', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('parte dai default senza preferenze salvate', () => {
    const store = TestBed.inject(DmLayoutStore);

    expect(store.leftOpen()).toBe(true);
    expect(store.rightOpen()).toBe(true);
    expect(store.dockOpen()).toBe(true);
    expect(store.dockTab()).toBe('initiative');
    expect(store.sections()).toEqual(DEFAULT_SECTIONS);
  });

  it('inverte i pannelli e riporta se una sezione viene aperta', () => {
    const store = TestBed.inject(DmLayoutStore);

    store.toggleLeft();
    store.toggleRight();
    store.toggleDock();
    expect(store.leftOpen()).toBe(false);
    expect(store.rightOpen()).toBe(false);
    expect(store.dockOpen()).toBe(false);

    expect(store.toggleSection('actors')).toBe(false);
    expect(store.sections().actors).toBe(false);
    expect(store.toggleSection('actors')).toBe(true);
    expect(store.sections().actors).toBe(true);
    expect(store.sections().scenes).toBe(true);

    store.setDockTab('dice');
    expect(store.dockTab()).toBe('dice');
    expect(store.dockOpen()).toBe(true);
  });

  it('persiste e ripristina le preferenze per campagna', () => {
    const store = TestBed.inject(DmLayoutStore);
    store.toggleLeft();
    store.toggleSection('fog');
    store.setDockTab('actions');
    store.toggleDock();
    store.persist('campaign-1');

    const stored = JSON.parse(localStorage.getItem(storageKey('campaign-1')) ?? 'null');
    expect(stored).toMatchObject({
      left: false,
      dock: false,
      tab: 'actions',
      sections: { fog: false, scenes: true },
    });

    store.toggleLeft();
    store.restore('campaign-1');
    expect(store.leftOpen()).toBe(false);
    expect(store.rightOpen()).toBe(true);
    expect(store.dockOpen()).toBe(false);
    expect(store.dockTab()).toBe('actions');
    expect(store.sections().fog).toBe(false);

    const other = freshStore();
    other.restore('campaign-2');
    expect(other.leftOpen()).toBe(true);
    expect(other.dockTab()).toBe('initiative');
    expect(other.sections()).toEqual(DEFAULT_SECTIONS);
  });

  it('reset ai default prima di applicare il payload salvato', () => {
    const store = TestBed.inject(DmLayoutStore);

    store.restore('campaign-1');
    expect(store.leftOpen()).toBe(true);
    expect(store.sections()).toEqual(DEFAULT_SECTIONS);

    store.toggleRight();
    store.toggleSection('tokens');
    store.restore('campaign-1');
    expect(store.rightOpen()).toBe(true);
    expect(store.sections().tokens).toBe(true);
  });

  it('ignora JSON corrotto o campi non validi', () => {
    localStorage.setItem(storageKey('campaign-1'), '{non-json');
    const corrupted = freshStore();
    corrupted.restore('campaign-1');
    expect(corrupted.leftOpen()).toBe(true);
    expect(corrupted.sections()).toEqual(DEFAULT_SECTIONS);

    localStorage.setItem(storageKey('campaign-1'), JSON.stringify({
      left: 'no',
      right: null,
      dock: 1,
      tab: 'unknown',
      sections: { scenes: 'no', actors: false, unknown: false },
    }));
    const partial = freshStore();
    partial.restore('campaign-1');
    expect(partial.leftOpen()).toBe(true);
    expect(partial.rightOpen()).toBe(true);
    expect(partial.dockOpen()).toBe(true);
    expect(partial.dockTab()).toBe('initiative');
    expect(partial.sections()).toEqual({ ...DEFAULT_SECTIONS, actors: false });

    localStorage.setItem(storageKey('campaign-1'), 'null');
    const empty = freshStore();
    empty.restore('campaign-1');
    expect(empty.sections()).toEqual(DEFAULT_SECTIONS);
  });

  it('non lancia se localStorage è bloccato', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const store = freshStore();

    expect(() => store.restore('campaign-1')).not.toThrow();
    expect(() => store.persist('campaign-1')).not.toThrow();
    expect(store.leftOpen()).toBe(true);

    get.mockRestore();
    set.mockRestore();
  });
});
