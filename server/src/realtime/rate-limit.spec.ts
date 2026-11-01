import { describe, expect, it } from 'vitest';
import { WsAttemptLimiter } from './rate-limit.js';

describe('WsAttemptLimiter', () => {
  it('consente fino al limite e poi blocca nella stessa finestra', () => {
    const now = 1_000;
    const limiter = new WsAttemptLimiter(2, 1_000, () => now);

    expect(limiter.allow('127.0.0.1')).toBe(true);
    expect(limiter.allow('127.0.0.1')).toBe(true);
    expect(limiter.allow('127.0.0.1')).toBe(false);
    expect(limiter.allow('10.0.0.2')).toBe(true);
  });

  it('riapre la finestra allo scadere del timeout', () => {
    let now = 1_000;
    const limiter = new WsAttemptLimiter(1, 1_000, () => now);

    expect(limiter.allow('client')).toBe(true);
    expect(limiter.allow('client')).toBe(false);
    now += 1_001;
    expect(limiter.allow('client')).toBe(true);
  });
});
