interface AttemptWindow {
  count: number;
  resetAt: number;
}

/**
 * Limitatore in-memory per i tentativi di upgrade WebSocket. È una istanza per
 * app (non un singleton di modulo), così due `buildApp` nello stesso processo
 * restano isolati. Il limite è per chiave, tipicamente l'IP del client.
 */
export class WsAttemptLimiter {
  private readonly attempts = new Map<string, AttemptWindow>();

  public constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
    private readonly maxKeys = 10_000,
  ) {
    if (max < 1 || windowMs < 1 || maxKeys < 1) {
      throw new Error('Limitatore WebSocket: parametri non validi');
    }
  }

  public allow(key: string): boolean {
    const current = this.now();
    this.prune(current);
    const entry = this.attempts.get(key);
    if (entry === undefined || entry.resetAt <= current) {
      this.attempts.set(key, { count: 1, resetAt: current + this.windowMs });
      return true;
    }
    if (entry.count >= this.max) {
      return false;
    }
    entry.count += 1;
    return true;
  }

  private prune(current: number): void {
    if (this.attempts.size < this.maxKeys) {
      return;
    }
    for (const [key, entry] of this.attempts) {
      if (entry.resetAt <= current) {
        this.attempts.delete(key);
      }
    }
    // Se dopo la scadenza la mappa è ancora piena, elimina le voci più vecchie
    // (Map conserva l'ordine di inserimento) per non crescere senza limite.
    while (this.attempts.size >= this.maxKeys) {
      const oldest = this.attempts.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.attempts.delete(oldest);
    }
  }
}
