import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const options = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function passwordRecord(password) {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, 64, options);
  return { salt, hash };
}

export async function matchesPassword(account, password) {
  const salt = account?.salt ?? Buffer.alloc(16);
  const actual = await derive(password, salt, 64, options);
  const matches = timingSafeEqual(actual, account?.password_hash ?? Buffer.alloc(64));
  return Boolean(account && matches);
}
