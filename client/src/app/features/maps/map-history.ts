import type { MapDocument } from '@dnd-vtt/shared';
import type { MapCommand } from './map-command';

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

/** Budget della history a comandi: 200 modifiche e 32 MB condivisi tra undo e redo. */
export const MAP_COMMAND_HISTORY_LIMITS: HistoryLimits = {
  maxEntries: 200,
  maxBytes: 32 * 1024 * 1024,
};

/**
 * History a comandi per il documento mappa.
 *
 * Ogni edit clona il documento una sola volta (costo transitorio) e conserva
 * solo il comando. Undo/redo applicano il comando inverso su un nuovo clone,
 * così gli stack non trattengono copie dell'intero documento. Undo e redo
 * condividono lo stesso budget: quando si supera il limite si scartano i
 * comandi più vecchi dell'undo, che sono quelli meno utili.
 */
export class MapHistory {
  private undoStack: MapCommand[] = [];
  private redoStack: MapCommand[] = [];
  private undoBytes = 0;
  private redoBytes = 0;
  private readonly limits: HistoryLimits;

  public constructor(limits: HistoryLimits = MAP_COMMAND_HISTORY_LIMITS) {
    this.limits = limits;
  }

  /** Byte complessivi occupati dai due stack. */
  public get bytes(): number {
    return this.undoBytes + this.redoBytes;
  }

  public get undoCount(): number {
    return this.undoStack.length;
  }

  public get redoCount(): number {
    return this.redoStack.length;
  }

  public get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Applica il comando a un clone del documento e svuota il redo. */
  public execute(current: MapDocument, command: MapCommand): MapDocument {
    const next = structuredClone(current);
    command.apply(next);
    this.redoStack = [];
    this.redoBytes = 0;
    this.pushUndo(command);
    return next;
  }

  /** Inverte l'ultimo comando; `null` quando non c'è nulla da annullare. */
  public undo(current: MapDocument): MapDocument | null {
    const command = this.undoStack.pop();
    if (command === undefined) {
      return null;
    }
    this.undoBytes -= command.bytes;
    const next = structuredClone(current);
    command.invert(next);
    this.redoStack.push(command);
    this.redoBytes += command.bytes;
    return next;
  }

  /** Riapplica l'ultimo comando annullato; `null` quando il redo è vuoto. */
  public redo(current: MapDocument): MapDocument | null {
    const command = this.redoStack.pop();
    if (command === undefined) {
      return null;
    }
    this.redoBytes -= command.bytes;
    const next = structuredClone(current);
    command.apply(next);
    this.pushUndo(command);
    return next;
  }

  /** Svuota entrambi gli stack e il budget occupato. */
  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.undoBytes = 0;
    this.redoBytes = 0;
  }

  private pushUndo(command: MapCommand): void {
    this.undoStack.push(command);
    this.undoBytes += command.bytes;
    while (
      this.undoStack.length > 0
      && (this.undoStack.length > this.limits.maxEntries
        || this.undoBytes + this.redoBytes > this.limits.maxBytes)
    ) {
      const removed = this.undoStack.shift();
      if (removed === undefined) {
        break;
      }
      this.undoBytes -= removed.bytes;
    }
  }
}
