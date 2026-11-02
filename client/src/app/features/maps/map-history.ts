import type { MapDocument } from '@dnd-vtt/shared';
import type { MapCommand } from './map-command';

/** Limiti applicati contemporaneamente alla history dell'editor. */
export interface HistoryLimits {
  readonly maxEntries: number;
  readonly maxBytes: number;
}

const encoder = new TextEncoder();

/** Byte UTF-8 del JSON serializzato: stima conservativa della memoria occupata. */
export const estimateJsonBytes = (value: unknown): number => {
  const json = JSON.stringify(value);
  return json === undefined ? 0 : encoder.encode(json).byteLength;
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
