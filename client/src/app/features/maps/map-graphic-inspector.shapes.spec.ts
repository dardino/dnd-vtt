import { TestBed } from '@angular/core/testing';
import type { ImageGraphic, PolygonGraphic, TextGraphic } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MapGraphicInspectorComponent } from './map-graphic-inspector.component';
import {
  buttonNamed,
  commit,
  fieldLabels,
  labelledInput,
  labelledSelect,
  optionValues,
  renderInspector,
  rootOf,
  type InspectorFixture,
} from './map-graphic-inspector.shapes-helper.spec';

const polygon = (overrides: Partial<PolygonGraphic> = {}): PolygonGraphic => ({
  kind: 'polygon',
  id: 'polygon-1',
  points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }],
  fill: '#4ea1ff',
  opacity: 0.35,
  z: 3,
  ...overrides,
});

const text = (overrides: Partial<TextGraphic> = {}): TextGraphic => ({
  kind: 'text',
  id: 'text-1',
  text: 'Sala del trono',
  fontFamily: 'sans',
  fontSize: 24,
  color: '#ffffff',
  x: 120,
  y: 80,
  opacity: 1,
  z: 2,
  ...overrides,
});

const image = (): ImageGraphic => ({
  kind: 'image',
  id: 'image-1',
  assetId: '0f8fad5b-d9cb-469f-a165-70867728950e',
  x: 10,
  y: 20,
  scale: 1.5,
  rotation: 0,
  flipH: false,
  flipV: false,
  opacity: 1,
  z: 0,
});

const emitted = (fixture: InspectorFixture): Array<{ field: string; value: number | string }> => {
  const values: Array<{ field: string; value: number | string }> = [];
  fixture.componentInstance.fieldChanged.subscribe((value) => values.push(value));
  return values;
};

describe('MapGraphicInspectorComponent variante poligono', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [MapGraphicInspectorComponent] });
  });

  it('mostra solo colore riempimento, opacità, z e rimozione', () => {
    const fixture = renderInspector(polygon());
    const labels = fieldLabels(fixture);

    expect(labels).toContain('Colore riempimento');
    expect(labels).toContain('Opacità');
    for (const hidden of ['X', 'Y', 'Scala', 'Rotazione']) {
      expect(labels, hidden).not.toContain(hidden);
    }
    expect(() => buttonNamed(fixture, 'Ribalta orizzontalmente')).toThrow();
    expect(() => buttonNamed(fixture, 'Porta in cima')).not.toThrow();
    expect(() => buttonNamed(fixture, 'Rimuovi grafica')).not.toThrow();
    expect(Number(labelledInput(fixture, 'Opacità').value)).toBeCloseTo(0.35, 5);

    fixture.destroy();
  });

  it('emette fill come stringa e opacity come numero al change', () => {
    const fixture = renderInspector(polygon());
    const changes = emitted(fixture);

    commit(labelledInput(fixture, 'Colore riempimento'), '#ff0000');
    commit(labelledInput(fixture, 'Opacità'), 0.8);

    expect(changes).toEqual([
      { field: 'fill', value: '#ff0000' },
      { field: 'opacity', value: 0.8 },
    ]);

    fixture.destroy();
  });

  it('rifiuta fill non esadecimale e opacità fuori range riallineando il DOM', () => {
    const fixture = renderInspector(polygon());
    const changes = emitted(fixture);
    const fill = labelledInput(fixture, 'Colore riempimento');
    const opacity = labelledInput(fixture, 'Opacità');

    commit(fill, 'red');
    commit(fill, '#fff');
    commit(opacity, 2);
    commit(opacity, -1);
    fixture.detectChanges();

    expect(changes).toEqual([]);
    expect(fill.value.toLowerCase()).toBe('#4ea1ff');
    expect(Number(opacity.value)).toBeCloseTo(0.35, 5);

    fixture.destroy();
  });

  it('emette zChanged e removed dai bottoni', () => {
    const fixture = renderInspector(polygon());
    const zChanged = vi.fn();
    const removed = vi.fn();
    fixture.componentInstance.zChanged.subscribe(zChanged);
    fixture.componentInstance.removed.subscribe(removed);

    buttonNamed(fixture, 'Porta in fondo').click();
    buttonNamed(fixture, 'Rimuovi grafica').click();

    expect(zChanged).toHaveBeenCalledWith('bottom');
    expect(removed).toHaveBeenCalledTimes(1);

    fixture.destroy();
  });
});

describe('MapGraphicInspectorComponent variante testo', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [MapGraphicInspectorComponent] });
  });

  it('mostra contenuto, font, dimensione, colore, X/Y, opacità, z e rimozione', () => {
    const fixture = renderInspector(text());
    const labels = fieldLabels(fixture);

    for (const label of ['Testo', 'Font', 'Dimensione', 'Colore', 'X', 'Y', 'Opacità']) {
      expect(labels, label).toContain(label);
    }
    for (const hidden of ['Scala', 'Rotazione']) {
      expect(labels, hidden).not.toContain(hidden);
    }
    expect(() => buttonNamed(fixture, 'Ribalta orizzontalmente')).toThrow();
    expect(() => buttonNamed(fixture, 'Porta su')).not.toThrow();
    expect(() => buttonNamed(fixture, 'Rimuovi grafica')).not.toThrow();

    expect(Number(labelledInput(fixture, 'X').value)).toBe(120);
    expect(Number(labelledInput(fixture, 'Y').value)).toBe(80);
    expect(Number(labelledInput(fixture, 'Dimensione').value)).toBe(24);

    fixture.destroy();
  });

  it('espone i quattro font e i limiti di dimensione e lunghezza', () => {
    const fixture = renderInspector(text());
    const font = labelledSelect(fixture, 'Font');
    const size = labelledInput(fixture, 'Dimensione');
    const content = labelledInput(fixture, 'Testo');

    expect(optionValues(font)).toEqual(['sans', 'serif', 'mono', 'display']);
    for (const option of Array.from(font.options)) {
      expect(option.textContent?.trim()).not.toBe('');
    }
    expect(size.min).toBe('8');
    expect(size.max).toBe('200');
    expect(content.maxLength).toBe(120);

    fixture.destroy();
  });

  it('emette i campi stringa e numerici al change', () => {
    const fixture = renderInspector(text());
    const changes = emitted(fixture);

    commit(labelledInput(fixture, 'Testo'), 'Nuovo titolo');
    commit(labelledSelect(fixture, 'Font'), 'serif');
    commit(labelledInput(fixture, 'Dimensione'), 32);
    commit(labelledInput(fixture, 'Colore'), '#ffcc00');
    commit(labelledInput(fixture, 'X'), 12);
    commit(labelledInput(fixture, 'Y'), 34);
    commit(labelledInput(fixture, 'Opacità'), 0.5);

    expect(changes).toEqual([
      { field: 'text', value: 'Nuovo titolo' },
      { field: 'fontFamily', value: 'serif' },
      { field: 'fontSize', value: 32 },
      { field: 'color', value: '#ffcc00' },
      { field: 'x', value: 12 },
      { field: 'y', value: 34 },
      { field: 'opacity', value: 0.5 },
    ]);

    fixture.destroy();
  });

  it('accetta solo coordinate X e Y intere, riallineando il DOM e lasciando passare gli interi', () => {
    const fixture = renderInspector(text());
    const changes = emitted(fixture);
    const x = labelledInput(fixture, 'X');
    const y = labelledInput(fixture, 'Y');

    commit(x, 12.5);
    commit(y, 3.7);
    fixture.detectChanges();

    expect(changes).toEqual([]);
    expect(Number(x.value)).toBe(120);
    expect(Number(y.value)).toBe(80);

    commit(x, 12);
    commit(y, 34);

    expect(changes).toEqual([
      { field: 'x', value: 12 },
      { field: 'y', value: 34 },
    ]);
    expect(Number(x.value)).toBe(12);
    expect(Number(y.value)).toBe(34);

    fixture.destroy();
  });

  it('non emette all’input, solo al change', () => {
    const fixture = renderInspector(text());
    const changes = emitted(fixture);
    const content = labelledInput(fixture, 'Testo');

    content.value = 'Bozza';
    content.dispatchEvent(new Event('input'));
    expect(changes).toEqual([]);

    content.dispatchEvent(new Event('change'));
    expect(changes).toEqual([{ field: 'text', value: 'Bozza' }]);

    fixture.destroy();
  });

  it('rifiuta testi vuoti, troppo lunghi o con caratteri di controllo riallineando il DOM', () => {
    const fixture = renderInspector(text());
    const changes = emitted(fixture);
    const content = labelledInput(fixture, 'Testo');

    // I newline non arrivano al componente: `HTMLInputElement` li sanifica
    // prima del `change`. La copertura resta nel test di `updateGraphicField`.
    for (const value of ['', 'a'.repeat(121), 'a\tb', 'a\0b']) {
      commit(content, value);
      fixture.detectChanges();
      expect(changes, JSON.stringify(value)).toEqual([]);
      expect(content.value).toBe('Sala del trono');
    }

    fixture.destroy();
  });

  it('rifiuta font, dimensione, colore e opacità invalidi', () => {
    const fixture = renderInspector(text());
    const changes = emitted(fixture);
    const font = labelledSelect(fixture, 'Font');
    const size = labelledInput(fixture, 'Dimensione');
    const color = labelledInput(fixture, 'Colore');
    const opacity = labelledInput(fixture, 'Opacità');

    commit(font, 'comic');
    commit(size, 7);
    commit(size, 201);
    commit(size, 7.5);
    commit(color, 'white');
    commit(color, '#fff');
    commit(opacity, 2);
    commit(opacity, -1);
    fixture.detectChanges();

    expect(changes).toEqual([]);
    expect(font.value).toBe('sans');
    expect(Number(size.value)).toBe(24);
    expect(color.value.toLowerCase()).toBe('#ffffff');
    expect(Number(opacity.value)).toBeCloseTo(1, 5);

    fixture.destroy();
  });
});

describe('MapGraphicInspectorComponent accessibilità', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [MapGraphicInspectorComponent] });
  });

  it('mantiene la sezione immagine con scala e flip', () => {
    const fixture = renderInspector(image());
    const labels = fieldLabels(fixture);

    expect(labels).toEqual(expect.arrayContaining(['X', 'Y', 'Scala', 'Rotazione', 'Opacità']));
    expect(() => buttonNamed(fixture, 'Ribalta orizzontalmente')).not.toThrow();
    expect(() => buttonNamed(fixture, 'Ribalta verticalmente')).not.toThrow();

    fixture.destroy();
  });

  it('dà un nome a ogni bottone e associa ogni campo alla sua label', () => {
    for (const graphic of [polygon(), text(), image()]) {
      const fixture = renderInspector(graphic);
      const root = rootOf(fixture);

      for (const button of Array.from(root.querySelectorAll('button'))) {
        const name = button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '';
        expect(name, graphic.kind).not.toBe('');
      }
      for (const icon of Array.from(root.querySelectorAll('mat-icon, .material-symbols-outlined'))) {
        expect(icon.getAttribute('aria-hidden'), graphic.kind).toBe('true');
      }
      for (const label of Array.from(root.querySelectorAll('label'))) {
        expect(label.control, `${graphic.kind}: ${label.textContent ?? ''}`).not.toBeNull();
      }

      fixture.destroy();
    }
  });
});
