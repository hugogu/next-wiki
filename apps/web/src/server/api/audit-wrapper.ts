import type { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { resolveActor } from '@/server/services/auth';
import { apiContextStore } from './api-context-store';
import * as audit from '@/server/services/audit';
import { apiError } from './errors';
import type { AuthStatus } from '@next-wiki/shared';

export type RouteHandler = (request: NextRequest, context: { params: Promise<Record<string, string | string[]>> }) => Promise<Response> | Response;

function formatAuthError(authError: string): string {
  switch (authError) {
    case 'malformed_token':
      return 'Malformed API key token';
    case 'invalid_key':
      return 'Invalid API key';
    case 'revoked_key':
      return 'API key has been revoked';
    case 'disabled_user':
      return 'API key owner account is disabled';
    default:
      return 'API key authentication failed';
  }
}

export function withApiAudit(handler: RouteHandler): RouteHandler {
  return async (request, context) => {
    const start = Date.now();
    const headersList = await headers();
    const auth = headersList.get('authorization');

    // No Bearer header: not an API call to audit; run handler normally.
    if (!auth?.startsWith('Bearer ')) {
      return handler(request, context);
    }

    const resolved = await resolveActor();
    const method = request.method;
    const path = new URL(request.url).pathname;

    if (!resolved.actor || resolved.authError) {
      const status = 401;
      const duration = Date.now() - start;
      const authStatus = (resolved.authError as AuthStatus) ?? 'invalid_key';
      try {
        await audit.writeEntry({
          keyId: null,
          userId: null,
          method,
          path,
          statusCode: status,
          durationMs: duration,
          authStatus,
          errorMessage: formatAuthError(resolved.authError ?? 'invalid_key'),
        });
      } catch {
        // Best-effort audit logging; don't fail the request.
      }
      return apiError('UNAUTHORIZED', formatAuthError(resolved.authError ?? 'invalid_key'), status);
    }

    const apiContext = {
      actor: resolved.actor,
      apiKeyInfo: resolved.apiKeyInfo,
    };

    return apiContextStore.run(apiContext, async () => {
      let response: Response;
      try {
        response = await handler(request, context);
      } catch {
        response = apiError('BAD_REQUEST', 'Internal server error', 500);
      }

      const duration = Date.now() - start;
      const status = response.status;
      const errorMessage = status >= 400 ? response.statusText || 'Request failed' : null;

      try {
        await audit.writeEntry({
          keyId: resolved.apiKeyInfo?.keyId ?? null,
          userId: resolved.apiKeyInfo?.userId ?? null,
          method,
          path,
          statusCode: status,
          durationMs: duration,
          authStatus: 'authenticated',
          errorMessage,
        });
      } catch {
        // Best-effort audit logging; don't fail the request.
      }

      return response;
    });
  };
}
