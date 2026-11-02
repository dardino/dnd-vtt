import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ActorSheetPortraitEditor,
  type PortraitFocus,
} from './actor-sheet-portrait-editor';

describe('ActorSheetPortraitEditor', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ActorSheetPortraitEditor] });
  });

  const create = (options: {
    url?: string | null;
    focusX?: number;
    focusY?: number;
    zoom?: number;
    busy?: boolean;
  } = {}) => {
    const fixture = TestBed.createComponent(ActorSheetPortraitEditor);
    fixture.componentRef.setInput('url', options.url ?? null);
    fixture.componentRef.setInput('focusX', options.focusX ?? 0.5);
    fixture.componentRef.setInput('focusY', options.focusY ?? 0.5);
    fixture.componentRef.setInput('zoom', options.zoom ?? 1);
    fixture.componentRef.setInput('busy', options.busy ?? false);
    fixture.detectChanges();
    return fixture;
  };

  it('mostra lo stato vuoto senza ritratto', () => {
    const fixture = create();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Nessun ritratto');
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('input[type="range"]')).toBeNull();
    expect(root.textContent).toContain('Carica ritratto');
  });

  it('mostra anteprima, focus e zoom del ritratto', () => {
    const fixture = create({ url: '/assets/portrait.png', focusX: 0.25, focusY: 0.75, zoom: 1.5 });
    const root = fixture.nativeElement as HTMLElement;
    const image = root.querySelector('img') as HTMLImageElement;
    const crop = root.querySelector('.portrait-editor__crop') as HTMLElement;
    const range = root.querySelector('input[type="range"]') as HTMLInputElement;

    expect(image.getAttribute('src')).toBe('/assets/portrait.png');
    expect(image.style.objectPosition).toBe('25% 75%');
    expect(image.style.transform).toBe('scale(1.5)');
    expect(crop.style.left).toBe('25%');
    expect(crop.style.top).toBe('75%');
    expect(range.value).toBe('1.5');
  });

  it('emette upload con il file scelto e svuota il campo', () => {
    const fixture = create();
    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector('input[type="file"]') as HTMLInputElement;
    const files: File[] = [];
    fixture.componentInstance.upload.subscribe((file) => files.push(file));
    const file = new File(['contenuto'], 'ritratto.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file] });

    input.dispatchEvent(new Event('change'));

    expect(files.map((entry) => entry.name)).toEqual(['ritratto.png']);
    expect(input.value).toBe('');
  });

  it('emette focusChange durante il trascinamento e save al rilascio', () => {
    const fixture = create({ url: '/assets/portrait.png' });
    const root = fixture.nativeElement as HTMLElement;
    const frame = root.querySelector('.portrait-editor__frame') as HTMLElement;
    frame.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 200,
      height: 100,
      right: 200,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    frame.setPointerCapture = vi.fn();
    const focuses: PortraitFocus[] = [];
    let saves = 0;
    fixture.componentInstance.focusChange.subscribe((focus) => focuses.push(focus));
    fixture.componentInstance.save.subscribe(() => {
      saves += 1;
    });

    frame.dispatchEvent(new MouseEvent('pointerdown', { clientX: 100, clientY: 50, bubbles: true }));
    frame.dispatchEvent(new MouseEvent('pointermove', { clientX: 50, clientY: 75, bubbles: true }));
    frame.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));

    expect(focuses.at(-1)).toEqual({ focusX: 0.25, focusY: 0.75 });
    expect(saves).toBe(1);
  });

  it('non emette save se il rilascio avviene senza trascinamento', () => {
    const fixture = create({ url: '/assets/portrait.png' });
    const root = fixture.nativeElement as HTMLElement;
    let saves = 0;
    fixture.componentInstance.save.subscribe(() => {
      saves += 1;
    });

    root.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));

    expect(saves).toBe(0);
  });

  it('emette zoomChange con limiti e save alla conferma', () => {
    const fixture = create({ url: '/assets/portrait.png' });
    const root = fixture.nativeElement as HTMLElement;
    const range = root.querySelector('input[type="range"]') as HTMLInputElement;
    const zooms: number[] = [];
    let saves = 0;
    fixture.componentInstance.zoomChange.subscribe((zoom) => zooms.push(zoom));
    fixture.componentInstance.save.subscribe(() => {
      saves += 1;
    });

    range.value = '2.5';
    range.dispatchEvent(new Event('input'));
    range.value = '9';
    range.dispatchEvent(new Event('input'));
    range.dispatchEvent(new Event('change'));

    expect(zooms).toEqual([2.5, 3]);
    expect(saves).toBe(1);
  });

  it('mostra il caricamento e disabilita il pulsante quando busy', () => {
    const fixture = create({ busy: true });
    const root = fixture.nativeElement as HTMLElement;
    const button = root.querySelector('button') as HTMLButtonElement;

    expect(button.textContent).toContain('Caricamento…');
    expect(button.disabled).toBe(true);
  });
});
