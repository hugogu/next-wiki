import { decryptAiJson, encryptAiJson } from '@/server/crypto/ai-encryption';
import { getAiSettings } from '@/server/services/ai-actions';
import { normalizeDomains } from './url-policy';
import type { EffectiveWebResearchSettings } from './types';

export async function getEffectiveWebResearchSettings(): Promise<EffectiveWebResearchSettings> {
  const settings = await getAiSettings();
  const provider = settings.webResearchProvider;
  return {
    enabled: settings.webResearchEnabled && Boolean(provider && settings.webResearchApiKeyEncrypted),
    provider,
    apiKey: settings.webResearchApiKeyEncrypted
      ? decryptAiJson<string>(settings.webResearchApiKeyEncrypted)
      : null,
    allowedDomains: normalizeDomains(settings.webResearchAllowedDomains),
    blockedDomains: normalizeDomains(settings.webResearchBlockedDomains),
    maxSearchesPerTurn: settings.webResearchMaxSearchesPerTurn,
    maxCandidatesPerSearch: settings.webResearchMaxCandidatesPerSearch,
    maxOpenedSourcesPerTurn: settings.webResearchMaxOpenedSourcesPerTurn,
    maxSourceChars: settings.webResearchMaxSourceChars,
    timeoutMs: settings.webResearchTimeoutMs,
  };
}

export { encryptAiJson as encryptWebResearchApiKey };
