const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'];

export const PLAYER_LINK_WARNING = 'Il link usa PUBLIC_URL e il telefono potrebbe non raggiungerlo: '
  + "imposta l'IP LAN del server.";
/**
 * Avvisa quando il QR punta a un host che il telefono non può raggiungere:
 * loopback oppure un host diverso da quello della console DM.
 */
export const playerLinkWarning = (
  url: string | null,
  consoleHostname: string,
): string | null => {
  if (url === null) {
    return null;
  }
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return null;
  }
  return LOOPBACK_HOSTS.includes(hostname) || hostname !== consoleHostname
    ? PLAYER_LINK_WARNING
    : null;
};
