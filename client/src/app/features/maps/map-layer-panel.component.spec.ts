import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { emptyMapDocument, type MapLayerKind, type MapLayers } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MapLayerPanelComponent } from './map-layer-panel.component';

const KINDS: readonly MapLayerKind[] = ['background', 'graphics', 'constraints', 'elements'];

const LABELS: Record<MapLayerKind, string> = {
  background: 'Sfondo',
  graphics: 'Grafica',
  constraints: 'Vincoli',
  elements: 'Elementi',
};

const baseLayers = (): MapLayers => emptyMapDocument('Layer', null, 700, 700).layers;

const withState = (
  layers: MapLayers,
  kind: MapLayerKind,
  patch: { visible?: boolean; locked?: boolean; opacity?: number },
): MapLayers =>
  layers.map((layer) =>
    layer.kind === kind ? { ...layer, ...patch } : layer,
  ) as MapLayers;

type PanelFixture = ComponentFixture<MapLayerPanelComponent>;

const render = (
  layers: MapLayers = baseLayers(),
  active: MapLayerKind = 'background',
): PanelFixture => {
  const fixture = TestBed.createComponent(MapLayerPanelComponent);
  fixture.componentRef.setInput('layers', layers);
  fixture.componentRef.setInput('active', active);
  fixture.detectChanges();
  return fixture;
};

const rowsOf = (fixture: PanelFixture): HTMLElement[] =>
  Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.layer-panel__row'));

const rowOf = (fixture: PanelFixture, kind: MapLayerKind): HTMLElement => {
  const row = rowsOf(fixture).find((entry) => entry.dataset['kind'] === kind);
  if (row === undefined) {
    throw new Error(`riga layer ${kind} assente`);
  }
  return row;
};

const controlOf = <T extends HTMLElement>(
  fixture: PanelFixture,
  kind: MapLayerKind,
  selector: string,
): T => {
  const control = rowOf(fixture, kind).querySelector<T>(selector);
  if (control === null) {
    throw new Error(`controllo ${selector} assente nella riga ${kind}`);
  }
  return control;
};

/** Keydown come lo emette il browser sul controllo focalizzato (fa bubbling alla riga). */
const pressKey = (element: HTMLElement, key: string): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
};

const KEYS = [
  { key: 'Enter', label: 'Invio' },
  { key: ' ', label: 'Spazio' },
] as const;

describe('MapLayerPanelComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [MapLayerPanelComponent] });
  });

  it('renderizza quattro righe nell’ordine della tupla con le etichette italiane', () => {
    const fixture = render();
    const rows = rowsOf(fixture);

    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.dataset['kind'])).toEqual([...KINDS]);
    for (const kind of KINDS) {
      const label = rowOf(fixture, kind).querySelector('.layer-panel__label');
      expect(label?.textContent?.trim()).toBe(LABELS[kind]);
    }

    fixture.destroy();
  });

  it('marca il layer attivo con aria-pressed e aria-current', () => {
    const fixture = render(baseLayers(), 'constraints');

    for (const kind of KINDS) {
      const activate = controlOf<HTMLButtonElement>(fixture, kind, '.layer-panel__activate');
      expect(activate.getAttribute('aria-pressed')).toBe(kind === 'constraints' ? 'true' : 'false');
      if (kind === 'constraints') {
        expect(activate.getAttribute('aria-current')).not.toBeNull();
      } else {
        expect(activate.getAttribute('aria-current')).toBeNull();
      }
    }

    fixture.destroy();
  });

  it('aggiorna lo stato attivo quando cambia l’input', () => {
    const fixture = render(baseLayers(), 'graphics');

    fixture.componentRef.setInput('active', 'elements');
    fixture.detectChanges();

    expect(controlOf(fixture, 'elements', '.layer-panel__activate').getAttribute('aria-pressed'))
      .toBe('true');
    expect(controlOf(fixture, 'graphics', '.layer-panel__activate').getAttribute('aria-pressed'))
      .toBe('false');

    fixture.destroy();
  });

  it('emette activated al click sulla riga', () => {
    const fixture = render();
    const emitted = vi.fn();
    fixture.componentInstance.activated.subscribe(emitted);

    rowOf(fixture, 'graphics').click();

    expect(emitted).toHaveBeenCalledTimes(1);
    expect(emitted).toHaveBeenCalledWith('graphics');

    fixture.destroy();
  });

  it('il pulsante di attivazione emette activated una sola volta', () => {
    const fixture = render();
    const emitted = vi.fn();
    fixture.componentInstance.activated.subscribe(emitted);

    controlOf<HTMLButtonElement>(fixture, 'elements', '.layer-panel__activate').click();

    expect(emitted).toHaveBeenCalledTimes(1);
    expect(emitted).toHaveBeenCalledWith('elements');

    fixture.destroy();
  });

  it('i controlli della riga non attivano il layer', () => {
    const fixture = render();
    const emitted = vi.fn();
    fixture.componentInstance.activated.subscribe(emitted);
    const row = rowOf(fixture, 'constraints');

    controlOf<HTMLButtonElement>(fixture, 'constraints', '.layer-panel__visibility').click();
    controlOf<HTMLButtonElement>(fixture, 'constraints', '.layer-panel__lock').click();
    const range = controlOf<HTMLInputElement>(fixture, 'constraints', '.layer-panel__opacity');
    range.dispatchEvent(new Event('input'));
    range.dispatchEvent(new Event('change'));

    expect(emitted).not.toHaveBeenCalled();

    row.click();
    expect(emitted).toHaveBeenCalledTimes(1);
    expect(emitted).toHaveBeenCalledWith('constraints');

    fixture.destroy();
  });

  it('l’occhio riflette visible e commuta al click', () => {
    const layers = baseLayers();
    const fixture = render(layers, 'background');
    const emitted = vi.fn();
    fixture.componentInstance.visibilityToggled.subscribe(emitted);
    const eye = controlOf<HTMLButtonElement>(fixture, 'background', '.layer-panel__visibility');

    expect(eye.getAttribute('aria-pressed')).toBe('true');
    expect(eye.getAttribute('aria-label')).toBe('Nascondi layer Sfondo');

    eye.click();
    expect(emitted).toHaveBeenCalledTimes(1);
    expect(emitted).toHaveBeenCalledWith({ kind: 'background', visible: false });

    fixture.componentRef.setInput('layers', withState(layers, 'background', { visible: false }));
    fixture.detectChanges();
    const hidden = controlOf<HTMLButtonElement>(fixture, 'background', '.layer-panel__visibility');
    expect(hidden.getAttribute('aria-pressed')).toBe('false');
    expect(hidden.getAttribute('aria-label')).toBe('Mostra layer Sfondo');

    fixture.destroy();
  });

  it('il lucchetto riflette locked e commuta al click', () => {
    const layers = baseLayers();
    const fixture = render(layers, 'constraints');
    const emitted = vi.fn();
    fixture.componentInstance.lockToggled.subscribe(emitted);
    const lock = controlOf<HTMLButtonElement>(fixture, 'constraints', '.layer-panel__lock');

    expect(lock.getAttribute('aria-pressed')).toBe('false');
    expect(lock.getAttribute('aria-label')).toBe('Blocca layer Vincoli');

    lock.click();
    expect(emitted).toHaveBeenCalledTimes(1);
    expect(emitted).toHaveBeenCalledWith({ kind: 'constraints', locked: true });

    fixture.componentRef.setInput('layers', withState(layers, 'constraints', { locked: true }));
    fixture.detectChanges();
    const locked = controlOf<HTMLButtonElement>(fixture, 'constraints', '.layer-panel__lock');
    expect(locked.getAttribute('aria-pressed')).toBe('true');
    expect(locked.getAttribute('aria-label')).toBe('Sblocca layer Vincoli');

    fixture.destroy();
  });

  it('emette l’opacità solo al change, come numero', () => {
    const layers = baseLayers();
    const fixture = render(layers, 'graphics');
    const emitted = vi.fn();
    fixture.componentInstance.opacityCommitted.subscribe(emitted);
    const range = controlOf<HTMLInputElement>(fixture, 'graphics', '.layer-panel__opacity');

    expect(range.type).toBe('range');
    expect(range.value).toBe('1');

    range.value = '0.4';
    range.dispatchEvent(new Event('input'));
    expect(emitted).not.toHaveBeenCalled();

    range.dispatchEvent(new Event('change'));
    expect(emitted).toHaveBeenCalledTimes(1);
    expect(emitted).toHaveBeenCalledWith({ kind: 'graphics', opacity: 0.4 });

    fixture.destroy();
  });

  it('mostra l’opacità del layer nell’input range', () => {
    const fixture = render(withState(baseLayers(), 'elements', { opacity: 0.35 }), 'elements');
    const range = controlOf<HTMLInputElement>(fixture, 'elements', '.layer-panel__opacity');

    expect(Number(range.value)).toBeCloseTo(0.35, 5);

    fixture.destroy();
  });

  it('associa una label a ogni range di opacità con limiti 0..1', () => {
    const fixture = render();

    for (const kind of KINDS) {
      const range = controlOf<HTMLInputElement>(fixture, kind, '.layer-panel__opacity');
      const labels = Array.from(range.labels ?? []);
      expect(labels).toHaveLength(1);
      expect(labels[0]?.textContent).toContain('Opacità');
      expect(labels[0]?.textContent).toContain(LABELS[kind]);
      expect(range.min).toBe('0');
      expect(range.max).toBe('1');
    }

    fixture.destroy();
  });

  for (const { key, label } of KEYS) {
    it(`${label} sull’occhio commuta la visibilità senza attivare il layer`, () => {
      const fixture = render(baseLayers(), 'background');
      const activated = vi.fn();
      const visibility = vi.fn();
      fixture.componentInstance.activated.subscribe(activated);
      fixture.componentInstance.visibilityToggled.subscribe(visibility);
      const eye = controlOf<HTMLButtonElement>(fixture, 'graphics', '.layer-panel__visibility');

      const event = pressKey(eye, key);

      expect(activated).not.toHaveBeenCalled();
      expect(visibility).toHaveBeenCalledTimes(1);
      expect(visibility).toHaveBeenCalledWith({ kind: 'graphics', visible: false });
      // Senza preventDefault il browser aggiungerebbe il click nativo: doppia commutazione.
      expect(event.defaultPrevented).toBe(true);

      fixture.destroy();
    });

    it(`${label} sul lucchetto commuta il lock senza attivare il layer`, () => {
      const fixture = render(baseLayers(), 'elements');
      const activated = vi.fn();
      const locked = vi.fn();
      fixture.componentInstance.activated.subscribe(activated);
      fixture.componentInstance.lockToggled.subscribe(locked);
      const lock = controlOf<HTMLButtonElement>(fixture, 'graphics', '.layer-panel__lock');

      const event = pressKey(lock, key);

      expect(activated).not.toHaveBeenCalled();
      expect(locked).toHaveBeenCalledTimes(1);
      expect(locked).toHaveBeenCalledWith({ kind: 'graphics', locked: true });
      expect(event.defaultPrevented).toBe(true);

      fixture.destroy();
    });
  }

  it('il click sull’etichetta di opacità non attiva il layer', () => {
    const fixture = render(baseLayers(), 'background');
    const activated = vi.fn();
    const opacity = vi.fn();
    fixture.componentInstance.activated.subscribe(activated);
    fixture.componentInstance.opacityCommitted.subscribe(opacity);
    const label = controlOf<HTMLElement>(fixture, 'constraints', '.layer-panel__opacity-label');

    label.click();

    expect(activated).not.toHaveBeenCalled();
    expect(opacity).not.toHaveBeenCalled();

    fixture.destroy();
  });

  it('usa icone decorative e nomi accessibili per i controlli', () => {
    const fixture = render(baseLayers(), 'elements');
    const root = fixture.nativeElement as HTMLElement;
    const icons = Array.from(root.querySelectorAll<HTMLElement>('.layer-panel__icon'));

    expect(icons.length).toBeGreaterThanOrEqual(8);
    for (const icon of icons) {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
      expect(icon.textContent?.trim()).not.toBe('');
    }

    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button'));
    expect(buttons.length).toBeGreaterThanOrEqual(8);
    for (const button of buttons) {
      const name = button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '';
      expect(name).not.toBe('');
    }

    fixture.destroy();
  });
});
