import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { env } from '@/server/config';
import { DomainError } from '@/server/errors';

function isBlockedAddress(value: string): boolean {
  let address = ipaddr.parse(value);
  if (address.kind() === 'ipv6') {
    const ipv6 = address as ipaddr.IPv6;
    if (ipv6.isIPv4MappedAddress()) address = ipv6.toIPv4Address();
  }
  return [
    'unspecified',
    'broadcast',
    'multicast',
    'linkLocal',
    'loopback',
    'private',
    'uniqueLocal',
    'carrierGradeNat',
    'reserved',
  ].includes(address.range());
}

async function validateUrl(url: URL, allowedPrivateOrigin?: string): Promise<void> {
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new DomainError('SOURCE_UNAVAILABLE', 'Remote URL is not allowed');
  }
  const allowPrivate = allowedPrivateOrigin === url.origin;
  const addresses = await lookup(url.hostname, { all: true, verbatim: true }).catch(() => []);
  if (addresses.length === 0) throw new DomainError('SOURCE_UNAVAILABLE', 'Remote host cannot be resolved');
  if (!allowPrivate && addresses.some((address) => isBlockedAddress(address.address))) {
    throw new DomainError('SOURCE_UNAVAILABLE', 'Remote host resolves to a disallowed network');
  }
}

export async function fetchRemote(input: {
  url: string | URL;
  headers?: Record<string, string>;
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  allowedPrivateOrigin?: string;
  method?: 'GET' | 'POST';
  body?: string;
}): Promise<{ bytes: Buffer; contentType: string; url: string; status: number }> {
  let current = new URL(input.url);
  const initialOrigin = current.origin;
  const maxBytes = input.maxBytes ?? env.CONTENT_ASSET_MAX_BYTES;
  const maxRedirects = input.maxRedirects ?? env.TRANSFER_REMOTE_MAX_REDIRECTS;
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    await validateUrl(current, input.allowedPrivateOrigin);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      input.timeoutMs ?? env.TRANSFER_REMOTE_TIMEOUT_MS,
    );
    try {
      const headers = current.origin === initialOrigin ? input.headers : undefined;
      const response = await fetch(current, {
        headers,
        method: input.method ?? 'GET',
        body: input.body,
        redirect: 'manual',
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new DomainError('SOURCE_INVALID_RESPONSE', 'Redirect is missing Location');
        current = new URL(location, current);
        input.method = 'GET';
        input.body = undefined;
        continue;
      }
      if (!response.ok || !response.body) {
        throw new DomainError('SOURCE_UNAVAILABLE', `Remote request failed with ${response.status}`);
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw new DomainError('INPUT_TOO_LARGE', 'Remote response exceeds configured limit');
        }
        chunks.push(value);
      }
      return {
        bytes: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))),
        contentType: response.headers.get('content-type')?.split(';')[0]?.trim() ?? '',
        url: current.toString(),
        status: response.status,
      };
    } catch (error) {
      if (error instanceof DomainError) throw error;
      if ((error as Error).name === 'AbortError') {
        throw new DomainError('SOURCE_TIMEOUT', 'Remote request timed out');
      }
      throw new DomainError('SOURCE_UNAVAILABLE', 'Remote request failed');
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new DomainError('SOURCE_UNAVAILABLE', 'Remote request redirected too many times');
}
