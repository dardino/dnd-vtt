import { describe, expect, it } from 'vitest';
import { PLAYER_LINK_WARNING, playerLinkWarning } from './player-link-warning';

describe('playerLinkWarning', () => {
  it('avvisa per un host loopback', () => {
    expect(playerLinkWarning('http://127.0.0.1:3100/play/token', '127.0.0.1'))
      .toBe(PLAYER_LINK_WARNING);
    expect(playerLinkWarning('http://localhost:3000/play/token', 'localhost'))
      .toBe(PLAYER_LINK_WARNING);
    expect(playerLinkWarning('http://[::1]:3000/play/token', '[::1]'))
      .toBe(PLAYER_LINK_WARNING);
  });

  it('non avvisa quando il QR usa lo stesso host della console', () => {
    expect(playerLinkWarning('http://192.168.1.50:3000/play/token', '192.168.1.50'))
      .toBeNull();
  });

  it('avvisa quando il QR usa un host diverso dalla console', () => {
    expect(playerLinkWarning('http://192.168.1.50:3000/play/token', 'localhost'))
      .toBe(PLAYER_LINK_WARNING);
  });

  it('ignora URL assenti o non validi', () => {
    expect(playerLinkWarning(null, 'localhost')).toBeNull();
    expect(playerLinkWarning('non-un-url', 'localhost')).toBeNull();
  });
});
