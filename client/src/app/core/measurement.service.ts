import { Injectable, computed, effect, signal } from '@angular/core';

export type MeasurementUnit = 'imperial' | 'metric';

const STORAGE_KEY = 'dnd-vtt.measurement-unit';
const METERS_PER_FOOT = 0.3;

const roundMeters = (value: number): number => Math.round(value * 10) / 10;

const formatNumber = (value: number): string =>
  new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(value);

export const feetToMeters = (feet: number): number => roundMeters(feet * METERS_PER_FOOT);

export const metersToFeet = (meters: number): number =>
  Math.max(0, Math.round(meters / METERS_PER_FOOT));

export const formatDistance = (feet: number, unit: MeasurementUnit): string => {
  const value = unit === 'metric' ? feetToMeters(feet) : feet;
  return `${formatNumber(value)} ${unit === 'metric' ? 'm' : 'ft'}`;
};

export const formatRangeLabel = (
  normal: number,
  long: number | undefined,
  unit: MeasurementUnit,
): string => {
  const first = unit === 'metric' ? feetToMeters(normal) : normal;
  if (long === undefined) {
    return `${formatNumber(first)} ${unit === 'metric' ? 'm' : 'ft'}`;
  }
  const second = unit === 'metric' ? feetToMeters(long) : long;
  return `${formatNumber(first)}/${formatNumber(second)} ${unit === 'metric' ? 'm' : 'ft'}`;
};

/** Converte le distanze in piedi contenute in un testo libero (es. "range 30/120 ft."). */
export const convertFeetText = (text: string): string => {
  const pattern = /(\d+(?:[.,]\d+)?)(?:\s*[/–-]\s*(\d+(?:[.,]\d+)?))?\s*[-\s]?(?:ft|feet|foot|piedi)\b/gi;
  return text.replace(pattern, (_match, first: string, second?: string) => {
    const normal = feetToMeters(Number.parseFloat(first.replace(',', '.')));
    if (second === undefined) {
      return `${formatNumber(normal)} m`;
    }
    const long = feetToMeters(Number.parseFloat(second.replace(',', '.')));
    return `${formatNumber(normal)}/${formatNumber(long)} m`;
  });
};

/**
 * Preferenza di unità di misura della UI. Il server continua a salvare tutto in
 * piedi: la conversione avviene solo nella presentazione e negli input.
 */
@Injectable({ providedIn: 'root' })
export class MeasurementService {
  public readonly unit = signal<MeasurementUnit>(this.readUnit());
  public readonly symbol = computed(() => (this.unit() === 'metric' ? 'm' : 'ft'));

  public constructor() {
    effect(() => {
      try {
        localStorage.setItem(STORAGE_KEY, this.unit());
      } catch {
        // localStorage può essere disabilitato: la preferenza resta valida per la sessione.
      }
    });
  }

  public set(unit: MeasurementUnit): void {
    this.unit.set(unit);
  }

  public toggle(): void {
    this.unit.set(this.unit() === 'metric' ? 'imperial' : 'metric');
  }

  /** Valore numerico da mostrare in un input, nella unità scelta. */
  public inputValue(feet: number): number {
    return this.unit() === 'metric' ? feetToMeters(feet) : feet;
  }

  /** Converte il valore digitato dall'utente in piedi interi per il server. */
  public feetFromInput(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return this.unit() === 'metric' ? metersToFeet(value) : Math.max(0, Math.round(value));
  }

  public formatDistance(feet: number): string {
    return formatDistance(feet, this.unit());
  }

  /**
   * Converte le distanze in un testo proveniente dal catalogo SRD. In unità
   * anglosassone il testo resta identico.
   */
  public formatText(text: string): string {
    return this.unit() === 'metric' ? convertFeetText(text) : text;
  }

  public formatRange(normal: number, long?: number): string {
    return formatRangeLabel(normal, long, this.unit());
  }

  private readUnit(): MeasurementUnit {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'metric' ? 'metric' : 'imperial';
    } catch {
      return 'imperial';
    }
  }
}
