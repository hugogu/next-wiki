import { createHash } from 'node:crypto';
import { decryptKey, encryptKey } from './key-encryption';

export function encryptAiJson(value: unknown): string {
  return encryptKey(JSON.stringify(value));
}

export function decryptAiJson<T>(encrypted: string): T {
  return JSON.parse(decryptKey(encrypted)) as T;
}

export function hashAiPayload(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
