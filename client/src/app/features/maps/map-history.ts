/** Snapshot della history con la dimensione già stimata, per non riserializzarla a ogni push. */
export interface HistorySnapshot<T> {
  readonly value: T;
  readonly bytes: number;
}

/** Limiti applicati contemporaneamente alla history dell'editor. */
export interface HistoryLimits {
  readonly maxEntries: number;
  readonly maxBytes: number;
}

/** Limite storico invariato (50) più un budget prudente per i documenti grandi. */
export const MAP_HISTORY_LIMITS: HistoryLimits = {
  maxEntries: 50,
  maxBytes: 32 * 1024 * 1024,
};

const encoder = new TextEncoder();

/** Byte UTF-8 del JSON serializzato: stima conservativa della memoria occupata. */
export const estimateJsonBytes = (value: unknown): number => {
  const json = JSON.stringify(value);
  return json === undefined ? 0 : encoder.encode(json).byteLength;
};

/** Crea lo snapshot misurando una sola volta il valore. */
export const snapshotOf = <T>(
  value: T,
  sizeOf: (value: T) => number = estimateJsonBytes,
): HistorySnapshot<T> => ({ value, bytes: sizeOf(value) });

/**
 * Aggiunge lo snapshot in coda e scarta i più vecchi finché la history
 * rispetta sia il numero massimo di entry sia il budget in byte.
 * Non muta l'array ricevuto; l'ordine cronologico resta invariato.
 */
export const pushBoundedHistory = <T>(
  history: readonly HistorySnapshot<T>[],
  snapshot: HistorySnapshot<T>,
  limits: HistoryLimits = MAP_HISTORY_LIMITS,
): HistorySnapshot<T>[] => {
  const next = [...history, snapshot];
  let bytes = next.reduce((total, entry) => total + entry.bytes, 0);
  while (next.length > 0 && (next.length > limits.maxEntries || bytes > limits.maxBytes)) {
    const removed = next.shift();
    if (removed === undefined) {
      break;
    }
    bytes -= removed.bytes;
  }
  return next;
};
