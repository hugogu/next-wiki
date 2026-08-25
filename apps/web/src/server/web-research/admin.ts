import { z } from 'zod';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { getActorUserId, type PermCtx } from '@/server/permissions';
import { assertCanManageAi } from '@/server/services/ai-admin';
import { getAiSettings, recordTerminalAction } from '@/server/services/ai-actions';
import { encryptWebResearchApiKey } from './settings';
import { validateDomains } from './url-policy';
import {
  executeWebResearchConnectionTest,
  persistWebResearchConnectionTest,
  recordWebResearchConnectionAttempt,
} from './connection-test';

const limitsSchema = z.object({
  maxSearchesPerTurn: z.number().int().min(1).max(5),
  maxCandidatesPerSearch: z.number().int().min(1).max(10),
  maxOpenedSourcesPerTurn: z.number().int().min(1).max(5),
  maxSourceChars: z.number().int().min(1_000).max(64_000),
  timeoutMs: z.number().int().min(1_000).max(60_000),
});

export const webResearchSettingsUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  provider: z.literal('tavily').optional(),
  apiKey: z.string().min(1).max(8_192).optional(),
  allowedDomains: z.array(z.string().trim().min(1).max(255)).max(300).optional(),
  blockedDomains: z.array(z.string().trim().min(1).max(255)).max(150).optional(),
  limits: limitsSchema.optional(),
});

function view(settings: Awaited<ReturnType<typeof getAiSettings>>) {
  return {
    enabled: settings.webResearchEnabled,
    provider: settings.webResearchProvider,
    credentialConfigured: Boolean(settings.webResearchApiKeyEncrypted),
    allowedDomains: settings.webResearchAllowedDomains,
    blockedDomains: settings.webResearchBlockedDomains,
    limits: {
      maxSearchesPerTurn: settings.webResearchMaxSearchesPerTurn,
      maxCandidatesPerSearch: settings.webResearchMaxCandidatesPerSearch,
      maxOpenedSourcesPerTurn: settings.webResearchMaxOpenedSourcesPerTurn,
      maxSourceChars: settings.webResearchMaxSourceChars,
      timeoutMs: settings.webResearchTimeoutMs,
    },
    lastConnectionTest: settings.webResearchLastTestAt
      ? { status: settings.webResearchLastTestStatus, completedAt: settings.webResearchLastTestAt.toISOString() }
      : null,
  };
}

export async function readWebResearchSettings(ctx: PermCtx) {
  assertCanManageAi(ctx);
  return view(await getAiSettings());
}

export async function updateWebResearchSettings(
  ctx: PermCtx,
  input: z.infer<typeof webResearchSettingsUpdateSchema>,
) {
  assertCanManageAi(ctx);
  const existing = await getAiSettings();
  let allowedDomains = existing.webResearchAllowedDomains;
  let blockedDomains = existing.webResearchBlockedDomains;
  try {
    if (input.allowedDomains !== undefined) allowedDomains = validateDomains(input.allowedDomains);
    if (input.blockedDomains !== undefined) blockedDomains = validateDomains(input.blockedDomains);
  } catch (error) {
    throw new DomainError('BAD_REQUEST', error instanceof Error ? error.message : 'Invalid web-research domain policy');
  }
  if (input.enabled && !(input.apiKey || existing.webResearchApiKeyEncrypted)) {
    throw new DomainError('BAD_REQUEST', 'A Tavily API key is required before enabling web research');
  }
  const values = {
    ...(input.enabled === undefined ? {} : { webResearchEnabled: input.enabled }),
    ...(input.provider === undefined ? {} : { webResearchProvider: input.provider }),
    ...(input.apiKey ? { webResearchApiKeyEncrypted: encryptWebResearchApiKey(input.apiKey) } : {}),
    ...(input.allowedDomains === undefined ? {} : { webResearchAllowedDomains: allowedDomains }),
    ...(input.blockedDomains === undefined ? {} : { webResearchBlockedDomains: blockedDomains }),
    ...(input.limits
      ? {
          webResearchMaxSearchesPerTurn: input.limits.maxSearchesPerTurn,
          webResearchMaxCandidatesPerSearch: input.limits.maxCandidatesPerSearch,
          webResearchMaxOpenedSourcesPerTurn: input.limits.maxOpenedSourcesPerTurn,
          webResearchMaxSourceChars: input.limits.maxSourceChars,
          webResearchTimeoutMs: input.limits.timeoutMs,
        }
      : {}),
    updatedBy: getActorUserId(ctx),
    updatedAt: new Date(),
  };
  const [saved] = await db
    .insert(schema.aiSettings)
    .values({ id: 'default', ...values })
    .onConflictDoUpdate({ target: schema.aiSettings.id, set: values })
    .returning();
  return view(saved!);
}

export async function testWebResearchConnection(ctx: PermCtx) {
  assertCanManageAi(ctx);
  const result = await executeWebResearchConnectionTest();
  await persistWebResearchConnectionTest(result);
  const actionId = await recordTerminalAction(ctx, {
    feature: 'web_research_test',
    status: result.ok ? 'completed' : 'failed',
    requestMetadata: { mode: 'synchronous', provider: result.provider ?? 'tavily' },
    resultMetadata: {
      provider: result.provider,
      status: result.status,
      latencyMs: result.latencyMs,
      ...(result.providerRequestId ? { providerRequestId: result.providerRequestId } : {}),
      ...(result.creditsUsed === undefined ? {} : { creditsUsed: result.creditsUsed }),
      ...(result.candidateCount === undefined ? {} : { candidateCount: result.candidateCount }),
    },
    errorCode: result.errorCode ?? null,
    errorMessage: result.errorMessage ?? null,
  });
  await recordWebResearchConnectionAttempt(actionId, result);
  return { ...result, actionId };
}
