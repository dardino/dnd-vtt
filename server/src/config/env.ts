import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  PUBLIC_URL: z.string().url().default('http://localhost:3000'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:4200,http://localhost:3000'),
  DM_PASSWORD: z.string().default(''),
  DM_PASSWORD_HASH: z.string().default(''),
  SESSION_SECRET: z.string().default(''),
  COOKIE_SECURE: z.enum(['auto', 'true', 'false']).default('auto'),
  TRUST_PROXY: z
    .preprocess((value) => {
      if (typeof value !== 'string') {
        return value;
      }
      const normalized = value.trim();
      if (normalized === '' || normalized === 'false') {
        return false;
      }
      if (normalized === 'true') {
        return true;
      }
      return /^\d+$/.test(normalized) ? Number(normalized) : value;
    }, z.union([z.boolean(), z.number().int().min(1).max(10)]))
    .default(false),
  DATABASE_PATH: z.string().min(1).default('data/dnd.db'),
  UPLOAD_DIR: z.string().min(1).default('data/uploads'),
  CLIENT_DIST: z.string().min(1).default('client/dist/browser'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(20),
  MAX_JSON_MB: z.coerce.number().positive().default(2),
  WS_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10_000).default(60),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type NodeEnv = z.infer<typeof rawEnvSchema>['NODE_ENV'];
export type CookieSecure = z.infer<typeof rawEnvSchema>['COOKIE_SECURE'];

export interface AppEnv {
  nodeEnv: NodeEnv;
  host: string;
  port: number;
  publicUrl: URL;
  allowedOrigins: readonly string[];
  dmPassword: string | undefined;
  dmPasswordHash: string | undefined;
  sessionSecret: string;
  cookieSecure: boolean;
  /** `false`, `true` (fidati di ogni proxy) o numero di hop fidati. */
  trustProxy: boolean | number;
  databasePath: string;
  uploadDir: string;
  clientDist: string;
  migrationsDir: string;
  maxUploadBytes: number;
  maxJsonBytes: number;
  wsRateLimitMax: number;
  logLevel: string;
  repoRoot: string;
}

const isLoopbackHost = (host: string): boolean => LOOPBACK_HOSTS.has(host.toLowerCase());

const SCRYPT_HASH_PATTERN = /^scrypt\$([A-Za-z0-9+/]+={0,2})\$([A-Za-z0-9+/]+={0,2})$/;
const SCRYPT_KEY_BYTES = 64;
const SCRYPT_MIN_SALT_BYTES = 16;

export interface ScryptPasswordHash {
  salt: Buffer;
  hash: Buffer;
}

/**
 * Formato accettato: `scrypt$<saltBase64>$<hashBase64>`. Il salt deve avere
 * almeno 16 byte e l'hash esattamente 64 (parametri scrypt di default Node).
 */
export const parseScryptPasswordHash = (value: string): ScryptPasswordHash | undefined => {
  const match = SCRYPT_HASH_PATTERN.exec(value);
  if (match === null) {
    return undefined;
  }
  const saltBase64 = match[1] ?? '';
  const hashBase64 = match[2] ?? '';
  const salt = Buffer.from(saltBase64, 'base64');
  const hash = Buffer.from(hashBase64, 'base64');
  if (
    salt.length < SCRYPT_MIN_SALT_BYTES
    || hash.length !== SCRYPT_KEY_BYTES
    || salt.toString('base64') !== saltBase64
    || hash.toString('base64') !== hashBase64
  ) {
    return undefined;
  }
  return { salt, hash };
};

const findRepoRoot = (start: string): string => {
  let directory = start;
  for (let depth = 0; depth < 8; depth += 1) {
    const manifest = join(directory, 'package.json');
    if (existsSync(manifest)) {
      try {
        const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { workspaces?: unknown };
        if (Array.isArray(parsed.workspaces)) {
          return directory;
        }
      } catch {
        // un package.json illeggibile non è la radice: si continua a risalire
      }
    }
    const parent = dirname(directory);
    if (parent === directory) {
      break;
    }
    directory = parent;
  }
  return process.cwd();
};

const absolute = (repoRoot: string, path: string): string =>
  isAbsolute(path) ? path : resolve(repoRoot, path);

const loadSessionSecret = (repoRoot: string, configured: string, nodeEnv: NodeEnv): string => {
  if (configured !== '') {
    if (configured.length < 32) {
      throw new Error('SESSION_SECRET deve essere lunga almeno 32 caratteri');
    }
    return configured;
  }
  if (nodeEnv === 'test') {
    return randomBytes(32).toString('hex');
  }
  const dataDir = join(repoRoot, 'data');
  const secretPath = join(dataDir, '.session-secret');
  mkdirSync(dataDir, { recursive: true });
  if (existsSync(secretPath)) {
    return readFileSync(secretPath, 'utf8').trim();
  }
  const generated = randomBytes(32).toString('hex');
  writeFileSync(secretPath, generated, { encoding: 'utf8', mode: 0o600 });
  return generated;
};

/**
 * Valida la configurazione una sola volta, all'avvio. Nessun altro modulo
 * legge `process.env`: qui si risolvono path, segreti e regole di sicurezza.
 */
export const createEnv = (
  raw: NodeJS.ProcessEnv = process.env,
  repoRoot: string = findRepoRoot(dirname(fileURLToPath(import.meta.url))),
): AppEnv => {
  const envFile = join(repoRoot, '.env');
  if (existsSync(envFile)) {
    try {
      process.loadEnvFile(envFile);
    } catch {
      // un .env illeggibile non deve impedire l'avvio: le env validate dicono il resto
    }
  }
  const parsed = rawEnvSchema.safeParse(raw);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.') || 'env').join(', ');
    throw new Error(`Configurazione non valida: ${fields}`);
  }
  const values = parsed.data;
  const publicUrl = new URL(values.PUBLIC_URL);
  const dmPassword = values.DM_PASSWORD === '' ? undefined : values.DM_PASSWORD;
  const dmPasswordHash = values.DM_PASSWORD_HASH === '' ? undefined : values.DM_PASSWORD_HASH;
  if (dmPasswordHash !== undefined && parseScryptPasswordHash(dmPasswordHash) === undefined) {
    throw new Error(
      'DM_PASSWORD_HASH non valida: atteso scrypt$<saltBase64>$<hashBase64>',
    );
  }
  const requiresPassword = !isLoopbackHost(values.HOST) || !isLoopbackHost(publicUrl.hostname);
  if (requiresPassword && dmPassword === undefined && dmPasswordHash === undefined) {
    throw new Error(
      'DM_PASSWORD o DM_PASSWORD_HASH è obbligatoria quando HOST o PUBLIC_URL non sono loopback',
    );
  }
  if (dmPassword !== undefined) {
    const minimumLength = requiresPassword ? 12 : 8;
    if (dmPassword.length < minimumLength) {
      throw new Error(
        requiresPassword
          ? 'DM_PASSWORD deve essere lunga almeno 12 caratteri fuori dal loopback'
          : 'DM_PASSWORD deve essere lunga almeno 8 caratteri',
      );
    }
  }
  const cookieSecure = values.COOKIE_SECURE === 'auto'
    ? publicUrl.protocol === 'https:'
    : values.COOKIE_SECURE === 'true';
  const allowedOrigins = values.ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');
  return {
    nodeEnv: values.NODE_ENV,
    host: values.HOST,
    port: values.PORT,
    publicUrl,
    allowedOrigins: [...new Set([...allowedOrigins, publicUrl.origin])],
    dmPassword,
    dmPasswordHash,
    sessionSecret: loadSessionSecret(repoRoot, values.SESSION_SECRET, values.NODE_ENV),
    cookieSecure,
    trustProxy: values.TRUST_PROXY,
    databasePath: absolute(repoRoot, values.DATABASE_PATH),
    uploadDir: absolute(repoRoot, values.UPLOAD_DIR),
    clientDist: absolute(repoRoot, values.CLIENT_DIST),
    migrationsDir: join(repoRoot, 'server', 'drizzle'),
    maxUploadBytes: Math.floor(values.MAX_UPLOAD_MB * 1024 * 1024),
    maxJsonBytes: Math.floor(values.MAX_JSON_MB * 1024 * 1024),
    wsRateLimitMax: values.WS_RATE_LIMIT_MAX,
    logLevel: values.LOG_LEVEL,
    repoRoot,
  };
};

export const isLoopbackAddress = (address: string): boolean => {
  const normalized = address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address;
  return normalized === '127.0.0.1' || normalized === '::1';
};

export const allowedHosts = (env: AppEnv): ReadonlySet<string> =>
  new Set(['localhost', '127.0.0.1', '::1', '[::1]', env.publicUrl.hostname.toLowerCase()]);
