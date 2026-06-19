import type { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { resolveActor } from '@/server/services/auth';
import { apiContextStore } from './api-context-store';
import * as audit from '@/server/services/audit';
import { apiError, internalError } from './errors';
import type { AuthStatus } from '@next-wiki/shared';

// Generic shape for any wrapped route. Concrete handlers have a narrower
// `params` type (e.g. `{ id: string }`); call sites cast to this on export, so
// the wrapper stays reusable while route bodies keep their precise typing.
export type RouteHandler = (request: NextRequest, context: { params: Promise<Record<string, string | string[]>> }) => Promise<Response> | Response;

/**
 * Extract a human-readable error message for the audit trail. Error responses
 * are JSON `{ code, message }` (see api/errors.ts); `statusText` is empty for
 * `NextResponse.json`, so we read the body rather than rely on it.
 */
async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.clone().json();
    if (body && typeof body === 'object' && typeof body.message === 'string') {
      return body.message;
    }
  } catch {
    // Non-JSON body; fall back to the status line, then the status code.
  }
  return response.statusText || `HTTP ${response.status}`;
}

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
    const hasBearerToken = auth?.startsWith('Bearer ') ?? false;
    const method = request.method;
    const path = new URL(request.url).pathname;
    const resolved = await resolveActor();

    if (!hasBearerToken && resolved.actor?.kind !== 'user') {
      return handler(request, context);
    }

    if (hasBearerToken && (!resolved.actor || resolved.authError)) {
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
      actor: resolved.actor ?? { kind: 'anonymous' as const },
      apiKeyInfo: resolved.apiKeyInfo,
    };

    return apiContextStore.run(apiContext, async () => {
      let response: Response;
      try {
        response = await handler(request, context);
      } catch (error) {
        console.error('Unhandled API handler error:', error);
        response = internalError();
      }

      const duration = Date.now() - start;
      const status = response.status;
      const errorMessage = status >= 400 ? await extractErrorMessage(response) : null;

      try {
        await audit.writeEntry({
          keyId: resolved.apiKeyInfo?.keyId ?? null,
          userId: resolved.apiKeyInfo?.userId ?? (resolved.actor?.kind === 'user' ? resolved.actor.userId : null),
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
