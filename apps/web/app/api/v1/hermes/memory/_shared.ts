import type { NextRequest } from 'next/server';
import { DomainError } from '@/server/errors';
import { publicJson, withPublicApi } from '../../_shared/route';

export { publicJson, withPublicApi };

export function assertSupportedProvider(request: NextRequest): void {
  const version = request.headers.get('x-next-wiki-hermes-provider-version')?.trim();
  if (!version || version.length > 64) {
    throw new DomainError('HERMES_MEMORY_INCOMPATIBLE_CLIENT', 'Update or reconfigure the next-wiki Hermes memory provider');
  }
}
