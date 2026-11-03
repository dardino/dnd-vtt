import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { DmUiStore, initialDmUiState } from './dm-ui.store';

describe('DmUiStore', () => {
  let store: InstanceType<typeof DmUiStore>;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(DmUiStore);
  });

  it('parte dai valori di default della console', () => {
    expect(store.statusMessage()).toBe('Console pronta.');
    expect(store.notice()).toBeNull();
    expect(store.busy()).toBe(false);
    expect(store.selectedTokenId()).toBeNull();
    expect(store.zoom()).toBe(1);
  });

  it('applica i patch dei singoli campi', () => {
    store.setStatusMessage('Scena creata');
    store.setNotice('Mappa non disponibile');
    store.setBusy(true);
    store.setSelectedTokenId('token-1');
    store.setZoom(1.5);

    expect(store.statusMessage()).toBe('Scena creata');
    expect(store.notice()).toBe('Mappa non disponibile');
    expect(store.busy()).toBe(true);
    expect(store.selectedTokenId()).toBe('token-1');
    expect(store.zoom()).toBe(1.5);

    store.setNotice(null);
    store.setSelectedTokenId(null);
    expect(store.notice()).toBeNull();
    expect(store.selectedTokenId()).toBeNull();
  });

  it('riporta lo stato ai default con reset', () => {
    store.setStatusMessage('modificato');
    store.setBusy(true);
    store.setZoom(3);

    store.reset();

    expect(store.statusMessage()).toBe(initialDmUiState.statusMessage);
    expect(store.busy()).toBe(false);
    expect(store.zoom()).toBe(1);
  });
});
