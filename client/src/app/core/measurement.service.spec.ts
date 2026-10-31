import { describe, expect, it } from 'vitest';
import {
  convertFeetText,
  feetToMeters,
  formatDistance,
  formatRangeLabel,
  metersToFeet,
} from './measurement.service';

describe('MeasurementService', () => {
  it('converte le distanze D&D con 1,5 m ogni 5 ft', () => {
    expect(feetToMeters(5)).toBe(1.5);
    expect(feetToMeters(30)).toBe(9);
    expect(feetToMeters(60)).toBe(18);
    expect(feetToMeters(120)).toBe(36);
    expect(metersToFeet(1.5)).toBe(5);
    expect(metersToFeet(9)).toBe(30);
  });

  it('formatta distanze e gittate nella unità scelta', () => {
    expect(formatDistance(30, 'imperial')).toBe('30 ft');
    expect(formatDistance(30, 'metric')).toBe('9 m');
    expect(formatRangeLabel(30, 120, 'imperial')).toBe('30/120 ft');
    expect(formatRangeLabel(30, 120, 'metric')).toBe('9/36 m');
  });

  it('converte le distanze nel testo SRD solo in metrico', () => {
    expect(convertFeetText('reach 5 ft., one target')).toBe('reach 1,5 m., one target');
    expect(convertFeetText('range 30/120 ft.')).toBe('range 9/36 m.');
    expect(convertFeetText('Teleport 30 feet.')).toBe('Teleport 9 m.');
    expect(convertFeetText('range self (60-foot cone)')).toBe('range self (18 m cone)');
  });
});
