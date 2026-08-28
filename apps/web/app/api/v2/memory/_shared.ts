import type { NextRequest } from 'next/server';
import { DomainError } from '@/server/errors';
import { publicJson, withPublicApi } from '../../v1/_shared/route';

export { publicJson, withPublicApi };

export function assertSupportedMemoryClient(request: NextRequest): void {
  const version = request.headers.get('x-next-wiki-memory-provider-version')?.trim();
  if (version && version.length > 64) {
    throw new DomainError('AGENT_MEMORY_INCOMPATIBLE_CLIENT', 'The memory client version is invalid');
  }
}
