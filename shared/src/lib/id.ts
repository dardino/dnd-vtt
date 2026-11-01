interface CryptoLike {
  getRandomValues?: (array: Uint8Array) => Uint8Array;
}

const randomBytes = (): Uint8Array => {
  const cryptoApi = (globalThis as { crypto?: CryptoLike }).crypto;
  if (cryptoApi === undefined || typeof cryptoApi.getRandomValues !== 'function') {
    throw new Error('Web Crypto non disponibile per generare gli id');
  }
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  return bytes;
};

const hex = (value: number): string => value.toString(16).padStart(2, '0');

/**
 * UUID v7 (RFC 9562): timestamp a 48 bit + casualità. Gli id restano
 * ordinabili nel tempo e non dipendono da un contatore globale (D6).
 */
export const newId = (now: number = Date.now()): string => {
  const bytes = randomBytes();
  const timestamp = BigInt(Math.max(0, Math.trunc(now)));
  bytes[0] = Number((timestamp >> 40n) & 0xffn);
  bytes[1] = Number((timestamp >> 32n) & 0xffn);
  bytes[2] = Number((timestamp >> 24n) & 0xffn);
  bytes[3] = Number((timestamp >> 16n) & 0xffn);
  bytes[4] = Number((timestamp >> 8n) & 0xffn);
  bytes[5] = Number(timestamp & 0xffn);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const parts = [
    [...bytes.slice(0, 4)],
    [...bytes.slice(4, 6)],
    [...bytes.slice(6, 8)],
    [...bytes.slice(8, 10)],
    [...bytes.slice(10, 16)],
  ];
  return parts.map((part) => part.map(hex).join('')).join('-');
};
