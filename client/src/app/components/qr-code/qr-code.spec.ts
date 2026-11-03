import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { QrCode } from './qr-code';
import { qrMatrix } from './qr-matrix';

const URL_A = 'http://192.168.1.50:3000/play/0123456789abcdefghijklmnopqrstuv';
const URL_B = 'http://192.168.1.50:3000/play/vutsrqponmlkjihgfedcba9876543210';

describe('QrCode', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [QrCode] });
  });

  const create = (value = URL_A) => {
    const fixture = TestBed.createComponent(QrCode);
    fixture.componentRef.setInput('value', value);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  };

  it('renderizza un svg accessibile', () => {
    const { fixture, element } = create();
    fixture.componentRef.setInput('label', 'QR della scheda');
    fixture.detectChanges();

    const svg = element.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('QR della scheda');
  });

  it('disegna sfondo bianco e path nero senza attributi style', () => {
    const { element } = create();

    expect(element.querySelector('rect')?.getAttribute('fill')).toBe('#fff');
    expect(element.querySelector('path')?.getAttribute('fill')).toBe('#000');
    expect(element.querySelectorAll('[style]')).toHaveLength(0);
  });

  it('rispetta la size richiesta', () => {
    const { fixture, element } = create();
    const svg = element.querySelector('svg');

    expect(svg?.getAttribute('width')).toBe('160');
    expect(svg?.getAttribute('height')).toBe('160');

    fixture.componentRef.setInput('size', 240);
    fixture.detectChanges();

    expect(svg?.getAttribute('width')).toBe('240');
    expect(svg?.getAttribute('height')).toBe('240');
    const { size } = qrMatrix(URL_A);
    expect(svg?.getAttribute('viewBox')).toBe(`0 0 ${size} ${size}`);
  });

  it('ricalcola il QR quando cambia il valore', () => {
    const { fixture, element } = create();
    const first = element.querySelector('path')?.getAttribute('d');

    fixture.componentRef.setInput('value', URL_B);
    fixture.detectChanges();
    const second = element.querySelector('path')?.getAttribute('d');

    expect(first).toBeTruthy();
    expect(second).not.toBe(first);
  });
});
