import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { MapGraphic } from '@dnd-vtt/shared';
import { describe, expect, it } from 'vitest';
import { MapGraphicInspectorComponent } from './map-graphic-inspector.component';

/**
 * Helper condivisi dagli spec dell'inspector grafiche.
 *
 * Il suffisso `.spec` è richiesto dal workspace per creare file di test: qui
 * vivono solo fixture e query DOM, nessun caso.
 */

export type InspectorFixture = ComponentFixture<MapGraphicInspectorComponent>;

export const renderInspector = (graphic: MapGraphic): InspectorFixture => {
  const fixture = TestBed.createComponent(MapGraphicInspectorComponent);
  fixture.componentRef.setInput('graphic', graphic);
  fixture.detectChanges();
  return fixture;
};

export const rootOf = (fixture: InspectorFixture): HTMLElement =>
  fixture.nativeElement as HTMLElement;

export const fieldLabels = (fixture: InspectorFixture): string[] =>
  Array.from(rootOf(fixture).querySelectorAll('label'))
    .map((label) => label.querySelector('span')?.textContent?.trim() ?? '')
    .filter((label) => label !== '');

export const labelledControl = (
  fixture: InspectorFixture,
  label: string,
): HTMLInputElement | HTMLSelectElement => {
  const labels = Array.from(rootOf(fixture).querySelectorAll('label'));
  const match = labels.find((entry) => entry.querySelector('span')?.textContent?.trim() === label);
  const control = match?.control;
  if (!(control instanceof HTMLInputElement) && !(control instanceof HTMLSelectElement)) {
    throw new Error(`campo ${label} assente o non associato`);
  }
  return control;
};

export const labelledInput = (
  fixture: InspectorFixture,
  label: string,
): HTMLInputElement => {
  const control = labelledControl(fixture, label);
  if (!(control instanceof HTMLInputElement)) {
    throw new Error(`campo ${label} non è un input`);
  }
  return control;
};

export const labelledSelect = (
  fixture: InspectorFixture,
  label: string,
): HTMLSelectElement => {
  const control = labelledControl(fixture, label);
  if (!(control instanceof HTMLSelectElement)) {
    throw new Error(`campo ${label} non è un select`);
  }
  return control;
};

export const buttonNamed = (
  fixture: InspectorFixture,
  name: string,
): HTMLButtonElement => {
  const button = Array.from(rootOf(fixture).querySelectorAll('button')).find(
    (entry) => (entry.getAttribute('aria-label') ?? entry.textContent ?? '').trim().includes(name),
  );
  if (button === undefined) {
    throw new Error(`bottone ${name} assente`);
  }
  return button;
};

export const commit = (
  control: HTMLInputElement | HTMLSelectElement,
  value: number | string,
): void => {
  control.value = String(value);
  control.dispatchEvent(new Event('change'));
};

export const optionValues = (select: HTMLSelectElement): string[] =>
  Array.from(select.options).map((option) => option.value);

// File di soli helper: la suite vuota evita l'errore "No test suite found".
describe.skip('helper inspector grafiche (nessun caso proprio)', () => {
  it('espone solo fixture', () => {
    expect(typeof renderInspector).toBe('function');
  });
});
