/** Envelope unico del protocollo WebSocket (D5/D75). */
export const envelope = (type: string, payload: unknown): string => JSON.stringify({
  v: 1,
  type,
  seq: Date.now(),
  at: new Date().toISOString(),
  payload,
});
