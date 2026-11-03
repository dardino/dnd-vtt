import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { SceneToolbar } from './scene-toolbar';
import { SceneToolsStore } from './scene-tools.store';

@Component({
  selector: 'app-scene-toolbar-host',
  imports: [SceneToolbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-scene-toolbar
      [canUndo]="canUndo()"
      [canRedo]="canRedo()"
      (openDice)="record('openDice')"
      (exportPng)="record('exportPng')"
      (undo)="record('undo')"
      (redo)="record('redo')"
      (settings)="record('settings')"
      (zoomIn)="record('zoomIn')"
      (zoomOut)="record('zoomOut')"
      (fitMap)="record('fitMap')"
    />
  `,
})
class HostComponent {
  public readonly canUndo = signal(false);
  public readonly canRedo = signal(false);
  public readonly events = signal<string[]>([]);

  public record(event: string): void {
    this.events.update((values) => [...values, event]);
  }
}

describe('SceneToolbar', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [HostComponent] });
  });

  const create = (): {
    root: HTMLElement;
    host: HostComponent;
    store: InstanceType<typeof SceneToolsStore>;
    fixture: ComponentFixture<HostComponent>;
  } => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return {
      root: fixture.nativeElement as HTMLElement,
      host: fixture.componentInstance,
      store: TestBed.inject(SceneToolsStore),
      fixture,
    };
  };

  const button = (root: HTMLElement, label: string): HTMLButtonElement => {
    const element = root.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
    if (element === null) {
      throw new Error(`Pulsante "${label}" non trovato`);
    }
    return element;
  };

  it('mostra il tool attivo e aggiorna lo store al click', () => {
    const { root, store, fixture } = create();

    expect(button(root, 'Seleziona').classList.contains('is-active')).toBe(true);
    expect(button(root, 'Misura distanza').classList.contains('is-active')).toBe(false);

    button(root, 'Misura distanza').click();
    fixture.detectChanges();
    expect(store.tool()).toBe('measure');
    expect(button(root, 'Misura distanza').classList.contains('is-active')).toBe(true);
    expect(button(root, 'Seleziona').classList.contains('is-active')).toBe(false);

    button(root, 'Fog: rivela').click();
    fixture.detectChanges();
    expect(store.tool()).toBe('fog-reveal');

    button(root, 'Fog: nascondi').click();
    fixture.detectChanges();
    expect(store.tool()).toBe('fog-hide');

    button(root, 'Fog: rettangolo').click();
    fixture.detectChanges();
    expect(store.tool()).toBe('fog-rect');

    button(root, 'Fog: lasso').click();
    fixture.detectChanges();
    expect(store.tool()).toBe('fog-lasso');

    button(root, 'Disegno').click();
    fixture.detectChanges();
    expect(store.tool()).toBe('draw');

    button(root, 'Seleziona').click();
    fixture.detectChanges();
    expect(store.tool()).toBe('select');
    expect(button(root, 'Seleziona').classList.contains('is-active')).toBe(true);
  });

  it('attiva e disattiva la griglia', () => {
    const { root, store, fixture } = create();
    const grid = button(root, 'Mostra griglia');

    expect(store.gridVisible()).toBe(true);
    expect(grid.classList.contains('is-active')).toBe(true);

    grid.click();
    fixture.detectChanges();
    expect(store.gridVisible()).toBe(false);
    expect(button(root, 'Mostra griglia').classList.contains('is-active')).toBe(false);

    button(root, 'Mostra griglia').click();
    fixture.detectChanges();
    expect(store.gridVisible()).toBe(true);
  });

  it('emette zoom, fit, dadi, export e impostazioni', () => {
    const { root, host, fixture } = create();

    for (const label of ['Zoom avanti', 'Zoom indietro', 'Adatta mappa', 'Tira dadi', 'Esporta PNG', 'Impostazioni mappa']) {
      button(root, label).click();
    }
    fixture.detectChanges();

    expect(host.events()).toEqual(['zoomIn', 'zoomOut', 'fitMap', 'openDice', 'exportPng', 'settings']);
  });

  it('disabilita annulla e ripeti senza history e li emette quando abilitati', () => {
    const { root, host, fixture } = create();
    const undo = button(root, 'Annulla');
    const redo = button(root, 'Ripeti');

    expect(undo.disabled).toBe(true);
    expect(redo.disabled).toBe(true);
    undo.click();
    redo.click();
    fixture.detectChanges();
    expect(host.events()).toEqual([]);

    host.canUndo.set(true);
    host.canRedo.set(true);
    fixture.detectChanges();

    button(root, 'Annulla').click();
    button(root, 'Ripeti').click();
    fixture.detectChanges();

    expect(host.events()).toEqual(['undo', 'redo']);
    expect(button(root, 'Annulla').disabled).toBe(false);
    expect(button(root, 'Ripeti').disabled).toBe(false);
  });
});
