import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { BlockedArea } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MapAreaInspectorComponent } from './map-area-inspector.component';

const rect = (overrides: Partial<BlockedArea> = {}): BlockedArea => ({
  id: 'area-rect',
  shape: 'rect',
  points: [{ x: 1, y: 1 }, { x: 3, y: 2 }],
  ...overrides,
});

const polygon = (overrides: Partial<BlockedArea> = {}): BlockedArea => ({
  id: 'area-polygon',
  shape: 'polygon',
  points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }],
  ...overrides,
});

type InspectorFixture = ComponentFixture<MapAreaInspectorComponent>;

const render = (area: BlockedArea = rect()): InspectorFixture => {
  const fixture = TestBed.createComponent(MapAreaInspectorComponent);
  fixture.componentRef.setInput('area', area);
  fixture.detectChanges();
  return fixture;
};

const rootOf = (fixture: InspectorFixture): HTMLElement =>
  fixture.nativeElement as HTMLElement;

/** Il campo label può usare `aria-label` o una `<label>` visibile. */
const labelInput = (fixture: InspectorFixture): HTMLInputElement => {
  const root = rootOf(fixture);
  const byAria = root.querySelector<HTMLInputElement>('input[aria-label="Etichetta area"]');
  if (byAria !== null) {
    return byAria;
  }
  const labels = Array.from(root.querySelectorAll('label'));
  const match = labels.find((entry) => entry.textContent?.includes('Etichetta area'));
  const control = match?.control;
  if (!(control instanceof HTMLInputElement)) {
    throw new Error('campo Etichetta area assente o senza nome accessibile');
  }
  return control;
};

const buttonNamed = (fixture: InspectorFixture, name: string): HTMLButtonElement => {
  const button = Array.from(rootOf(fixture).querySelectorAll('button')).find(
    (entry) => (entry.getAttribute('aria-label') ?? entry.textContent ?? '').trim().includes(name),
  );
  if (button === undefined) {
    throw new Error(`bottone ${name} assente`);
  }
  return button;
};

const commit = (input: HTMLInputElement, value: string): void => {
  input.value = value;
  input.dispatchEvent(new Event('change'));
};

describe('MapAreaInspectorComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [MapAreaInspectorComponent] });
  });

  it('mostra il campo etichetta con il valore dell’area', () => {
    const fixture = render(rect({ label: 'Sala del trono' }));

    expect(labelInput(fixture).value).toBe('Sala del trono');

    fixture.destroy();
  });

  it('mostra un campo vuoto quando l’area non ha etichetta', () => {
    const fixture = render(polygon());

    expect(labelInput(fixture).value).toBe('');

    fixture.destroy();
  });

  it('riflette il cambio dell’input area', () => {
    const fixture = render(rect());
    expect(labelInput(fixture).value).toBe('');

    fixture.componentRef.setInput('area', rect({ label: 'Cripta' }));
    fixture.detectChanges();

    expect(labelInput(fixture).value).toBe('Cripta');

    fixture.destroy();
  });

  it('emette labelChanged al change e non all’input', () => {
    const fixture = render(rect());
    const emitted = vi.fn();
    fixture.componentInstance.labelChanged.subscribe(emitted);
    const input = labelInput(fixture);

    input.value = 'Sala';
    input.dispatchEvent(new Event('input'));
    expect(emitted).not.toHaveBeenCalled();

    input.dispatchEvent(new Event('change'));
    expect(emitted).toHaveBeenCalledTimes(1);
    expect(emitted).toHaveBeenCalledWith('Sala');

    fixture.destroy();
  });

  it('emette labelChanged con il valore corrente del campo', () => {
    const fixture = render(polygon({ label: 'Vecchia' }));
    const emitted = vi.fn();
    fixture.componentInstance.labelChanged.subscribe(emitted);

    commit(labelInput(fixture), 'Nuova');

    expect(emitted).toHaveBeenCalledWith('Nuova');
    fixture.destroy();
  });

  it('emette removed dal bottone Rimuovi area', () => {
    const fixture = render(rect());
    const emitted = vi.fn();
    fixture.componentInstance.removed.subscribe(emitted);

    buttonNamed(fixture, 'Rimuovi area').click();

    expect(emitted).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });

  it('espone un nome accessibile per il campo e per le icone decorative', () => {
    const fixture = render(rect());
    const root = rootOf(fixture);
    const input = root.querySelector<HTMLInputElement>('input[aria-label="Etichetta area"]');

    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(input?.getAttribute('aria-label')).toBe('Etichetta area');
    expect(buttonNamed(fixture, 'Rimuovi area').getAttribute('aria-label'))
      .toBe('Rimuovi area');

    const icons = Array.from(
      root.querySelectorAll<HTMLElement>('.material-symbols-outlined, mat-icon'),
    );
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
    }

    fixture.destroy();
  });
});
