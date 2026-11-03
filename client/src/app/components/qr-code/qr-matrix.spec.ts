import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { QrCode } from './qr-code';
import { qrMatrix } from './qr-matrix';

const LAN_BASE = 'http://192.168.1.50:3000/play/';
const TOKEN_32 = '0123456789abcdefghijklmnopqrstuv';
const URL_62 = `${LAN_BASE}${TOKEN_32}`;
const MARGIN = 4;

interface VerticalRun {
  x: number;
  y: number;
  height: number;
}

const RUN_PATTERN = /M(\d+) (\d+)h1v(\d+)h-1Z/g;

const runs = (path: string): VerticalRun[] =>
  [...path.matchAll(RUN_PATTERN)].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
    height: Number(match[3]),
  }));

describe('qrMatrix', () => {
  it('genera una matrice quadrata con quiet zone', () => {
    const { size, path } = qrMatrix(URL_62);
    const items = runs(path);

    expect(size % 4).toBe(1);
    expect(items.length).toBeGreaterThan(0);
    for (const { x, y, height } of items) {
      expect(x).toBeGreaterThanOrEqual(MARGIN);
      expect(x).toBeLessThan(size - MARGIN);
      expect(y).toBeGreaterThanOrEqual(MARGIN);
      expect(height).toBeGreaterThan(0);
      expect(y + height).toBeLessThanOrEqual(size - MARGIN);
    }
  });

  it('sceglie la versione automaticamente', () => {
    expect(URL_62).toHaveLength(62);
    expect(qrMatrix(URL_62).size).toBe(41);
    expect(qrMatrix('x'.repeat(120)).size).toBeGreaterThan(41);
  });

  it('produce un path SVG non vuoto con coordinate dentro il viewBox', () => {
    const { size, path } = qrMatrix(URL_62);
    const items = runs(path);

    expect(path.startsWith('M')).toBe(true);
    expect(items.length).toBeGreaterThan(0);
    expect(path.replace(RUN_PATTERN, '')).toBe('');
    for (const { x, y, height } of items) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(size);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(height).toBeGreaterThan(0);
      expect(y + height).toBeLessThanOrEqual(size);
    }
  });
});

describe('QrCode viewBox', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [QrCode] });
  });

  it('include la quiet zone nel viewBox', () => {
    const fixture = TestBed.createComponent(QrCode);
    fixture.componentRef.setInput('value', URL_62);
    fixture.detectChanges();

    const { size } = qrMatrix(URL_62);
    const svg = (fixture.nativeElement as HTMLElement).querySelector('svg');

    expect(svg?.getAttribute('viewBox')).toBe(`0 0 ${size} ${size}`);
  });
});
