#!/usr/bin/env node
/**
 * Genera un hash scrypt per `DM_PASSWORD_HASH`.
 *
 * Uso interattivo (la password non viene mostrata):
 *   npm run hash:password
 *
 * Uso da pipe/CI:
 *   echo "la-mia-password" | npm run hash:password
 */
import { randomBytes, scryptSync } from 'node:crypto';
import process from 'node:process';

const MIN_LENGTH = 12;
const SALT_BYTES = 32;
const KEY_BYTES = 64;

const readPipedSecret = async () => {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input.replace(/\r?\n$/, '');
};

const readInteractiveSecret = (prompt) => new Promise((resolve) => {
  const stdin = process.stdin;
  let value = '';
  process.stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.setEncoding('utf8');
  stdin.resume();

  const finish = () => {
    stdin.setRawMode(false);
    stdin.pause();
    stdin.removeListener('data', onData);
    process.stdout.write('\n');
    resolve(value);
  };

  const onData = (chunk) => {
    for (const char of chunk) {
      if (char === '\r' || char === '\n' || char === '\u0004') {
        finish();
        return;
      }
      if (char === '\u0003') {
        stdin.setRawMode(false);
        process.stdout.write('\n');
        process.exit(130);
      }
      if (char === '\u007f' || char === '\b') {
        value = value.slice(0, -1);
        continue;
      }
      value += char;
    }
  };

  stdin.on('data', onData);
});

const secret = process.stdin.isTTY
  ? await readInteractiveSecret('Password DM: ')
  : await readPipedSecret();

if (secret.length < MIN_LENGTH) {
  process.stderr.write(`La password deve essere lunga almeno ${MIN_LENGTH} caratteri.\n`);
  process.exit(1);
}

const salt = randomBytes(SALT_BYTES);
const hash = scryptSync(secret, salt, KEY_BYTES);

process.stdout.write(`scrypt$${salt.toString('base64')}$${hash.toString('base64')}\n`);
