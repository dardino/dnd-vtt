import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { MapGraphic } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MapGraphicInspectorComponent } from './map-graphic-inspector.component';

const GRAPHIC_ASSET_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

const graphic = (overrides: Partial<MapGraphic> = {}): MapGraphic => ({
  id: 'graphic-1',
  assetId: GRAPHIC_ASSET_ID,
  x: 120,
  y: 80,
  scale: 1.5,
  rotation: 45,
  flipH: false,
  flipV: false,
  opacity: 0.75,
  z: 2,
  ...overrides,
});

type InspectorFixture = ComponentFixture<MapGraphicInspectorComponent>;

const render = (value: MapGraphic = graphic()): InspectorFixture => {
  const fixture = TestBed.createComponent(MapGraphicInspectorComponent);
  fixture.componentRef.setInput('graphic', value);
  fixture.detectChanges();
  return fixture;
};

const rootOf = (fixture: InspectorFixture): HTMLElement =>
  fixture.nativeElement as HTMLElement;

/** Le label seguono il pattern `<label><span>Nome</span><input /></label>` del repo. */
const labelledControl = (
  fixture: InspectorFixture,
  label: string,
): HTMLInputElement => {
  const labels = Array.from(rootOf(fixture).querySelectorAll('label'));
  const match = labels.find((entry) => entry.querySelector('span')?.textContent?.trim() === label);
  const control = match?.control;
  if (!(control instanceof HTMLInputElement)) {
    throw new Error(`campo numerico ${label} assente o non associato`);
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

const commit = (input: HTMLInputElement, value: number | string): void => {
  input.value = String(value);
  input.dispatchEvent(new Event('change'));
};

describe('MapGraphicInspectorComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [MapGraphicInspectorComponent] });
  });

  it('mostra i cinque campi numerici con le label e i valori della grafica', () => {
    const fixture = render();
    const cases = [
      { label: 'X', value: 120 },
      { label: 'Y', value: 80 },
      { label: 'Scala', value: 1.5 },
      { label: 'Rotazione', value: 45 },
      { label: 'Opacità', value: 0.75 },
    ];

    for (const { label, value } of cases) {
      const input = labelledControl(fixture, label);
      expect(input.type).toBe('number');
      expect(Number(input.value)).toBeCloseTo(value, 5);
    }

    fixture.destroy();
  });

  it('aggiorna i valori quando l’input grafica cambia', () => {
    const fixture = render();

    fixture.componentRef.setInput('graphic', graphic({ x: 10, scale: 2, opacity: 0.2 }));
    fixture.detectChanges();

    expect(Number(labelledControl(fixture, 'X').value)).toBe(10);
    expect(Number(labelledControl(fixture, 'Scala').value)).toBe(2);
    expect(Number(labelledControl(fixture, 'Opacità').value)).toBeCloseTo(0.2, 5);

    fixture.destroy();
  });

  it('emette fieldChanged al change e non all’input', () => {
    const fixture = render();
    const emitted = vi.fn();
    fixture.componentInstance.fieldChanged.subscribe(emitted);
    const input = labelledControl(fixture, 'X');

    input.value = '42';
    input.dispatchEvent(new Event('input'));
    expect(emitted).not.toHaveBeenCalled();

    input.dispatchEvent(new Event('change'));
    expect(emitted).toHaveBeenCalledTimes(1);
    expect(emitted).toHaveBeenCalledWith({ field: 'x', value: 42 });

    fixture.destroy();
  });

  const fieldCases = [
    { label: 'X', field: 'x', value: 33.5 },
    { label: 'Y', field: 'y', value: -12 },
    { label: 'Scala', field: 'scale', value: 2.5 },
    { label: 'Rotazione', field: 'rotation', value: 90 },
    { label: 'Opacità', field: 'opacity', value: 0.4 },
  ] as const;

  for (const { label, field, value } of fieldCases) {
    it(`emette { field: '${field}' } dal cambio di ${label}`, () => {
      const fixture = render();
      const emitted = vi.fn();
      fixture.componentInstance.fieldChanged.subscribe(emitted);

      commit(labelledControl(fixture, label), value);

      expect(emitted).toHaveBeenCalledWith({ field, value });
      fixture.destroy();
    });
  }

  it('non emette mai scala o opacità fuori range', () => {
    const fixture = render();
    const emitted = vi.fn();
    fixture.componentInstance.fieldChanged.subscribe(emitted);
    const scale = labelledControl(fixture, 'Scala');
    const opacity = labelledControl(fixture, 'Opacità');

    // I limiti nativi degli input riflettono il vincolo del modello.
    expect(Number(scale.min)).toBeGreaterThan(0);
    expect(opacity.min).toBe('0');
    expect(opacity.max).toBe('1');

    commit(scale, 0);
    commit(scale, -3);
    expect(emitted).not.toHaveBeenCalled();

    commit(opacity, 2);
    commit(opacity, -1);
    expect(emitted).not.toHaveBeenCalled();

    fixture.destroy();
  });

  const resetCases = [
    { label: 'Scala', invalid: 0, expected: 1.5 },
    { label: 'Opacità', invalid: 2, expected: 0.75 },
  ] as const;

  for (const { label, invalid, expected } of resetCases) {
    it(`ripristina ${label} al valore del modello dopo un commit rifiutato`, () => {
      const fixture = render();
      const input = labelledControl(fixture, label);

      commit(input, invalid);
      fixture.detectChanges();

      expect(Number(input.value)).toBeCloseTo(expected, 5);

      fixture.destroy();
    });
  }

  it('ignora i valori non numerici', () => {
    const fixture = render();
    const emitted = vi.fn();
    fixture.componentInstance.fieldChanged.subscribe(emitted);

    commit(labelledControl(fixture, 'X'), 'abc');

    expect(emitted).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('riflette il flip e lo emette dai due bottoni', () => {
    const fixture = render();
    const emitted = vi.fn();
    fixture.componentInstance.flipped.subscribe(emitted);
    const horizontal = buttonNamed(fixture, 'Ribalta orizzontalmente');
    const vertical = buttonNamed(fixture, 'Ribalta verticalmente');

    expect(horizontal.getAttribute('aria-pressed')).toBe('false');
    expect(vertical.getAttribute('aria-pressed')).toBe('false');

    horizontal.click();
    expect(emitted).toHaveBeenLastCalledWith('h');
    vertical.click();
    expect(emitted).toHaveBeenLastCalledWith('v');

    fixture.componentRef.setInput('graphic', graphic({ flipH: true, flipV: true }));
    fixture.detectChanges();
    expect(buttonNamed(fixture, 'Ribalta orizzontalmente').getAttribute('aria-pressed'))
      .toBe('true');
    expect(buttonNamed(fixture, 'Ribalta verticalmente').getAttribute('aria-pressed'))
      .toBe('true');

    fixture.destroy();
  });

  const zCases = [
    { name: 'Porta su', direction: 'up' },
    { name: 'Porta giù', direction: 'down' },
    { name: 'Porta in cima', direction: 'top' },
    { name: 'Porta in fondo', direction: 'bottom' },
  ] as const;

  for (const { name, direction } of zCases) {
    it(`emette zChanged '${direction}' dal bottone ${name}`, () => {
      const fixture = render();
      const emitted = vi.fn();
      fixture.componentInstance.zChanged.subscribe(emitted);

      buttonNamed(fixture, name).click();

      expect(emitted).toHaveBeenCalledTimes(1);
      expect(emitted).toHaveBeenCalledWith(direction);
      fixture.destroy();
    });
  }

  it('emette removed dal bottone di rimozione', () => {
    const fixture = render();
    const emitted = vi.fn();
    fixture.componentInstance.removed.subscribe(emitted);

    buttonNamed(fixture, 'Rimuovi grafica').click();

    expect(emitted).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });

  it('espone un nome accessibile per ogni bottone e icone decorative', () => {
    const fixture = render();
    const root = rootOf(fixture);
    const buttons = Array.from(root.querySelectorAll('button'));

    expect(buttons.length).toBeGreaterThanOrEqual(7);
    for (const button of buttons) {
      const name = button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '';
      expect(name).not.toBe('');
    }
    for (const icon of Array.from(root.querySelectorAll('mat-icon, .material-symbols-outlined'))) {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
    }

    fixture.destroy();
  });
});
