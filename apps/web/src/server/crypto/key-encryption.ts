import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '@/server/config';

const ALGORITHM = 'aes-256-gcm';
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const KEY_HEX_LENGTH = 64;

function getKeyBuffer(): Buffer {
  const key = env.API_KEY_ENCRYPTION_KEY;
  if (!key || key.length !== KEY_HEX_LENGTH) {
    throw new Error('API_KEY_ENCRYPTION_KEY must be a 64-character hex string');
  }
  return Buffer.from(key, 'hex');
}

export function encryptKey(plaintext: string): string {
  const key = getKeyBuffer();
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([nonce, ciphertext, tag]);
  return combined.toString('base64url');
}

export function decryptKey(encrypted: string): string {
  const key = getKeyBuffer();
  const combined = Buffer.from(encrypted, 'base64url');
  if (combined.length < NONCE_BYTES + TAG_BYTES + 1) {
    throw new Error('Invalid encrypted key format');
  }
  const nonce = combined.subarray(0, NONCE_BYTES);
  const tag = combined.subarray(combined.length - TAG_BYTES);
  const ciphertext = combined.subarray(NONCE_BYTES, combined.length - TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function constantTimeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) {
    // Still perform a comparison to avoid leaking which input is shorter, but
    // against a zero-length buffer of the target length.
    timingSafeEqual(aBuf, Buffer.alloc(aBuf.length));
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}
