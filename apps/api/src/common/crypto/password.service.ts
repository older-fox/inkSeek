import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

@Injectable()
export class PasswordService {
  /** Returns a self-describing `scrypt$salt$hash` string with a fresh random salt. */
  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES).toString('hex');
    const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
    return `scrypt$${salt}$${derived.toString('hex')}`;
  }

  /** Compares in constant time; malformed or foreign hashes simply fail. */
  async verify(password: string, stored: string): Promise<boolean> {
    const [scheme, salt, hash] = stored.split('$');

    if (scheme !== 'scrypt' || !salt || !hash) {
      return false;
    }

    const expected = Buffer.from(hash, 'hex');
    const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;

    return expected.length === derived.length && timingSafeEqual(expected, derived);
  }
}
