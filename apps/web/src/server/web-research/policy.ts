import { DomainError } from '@/server/errors';
import { getWebResearchConnector } from './registry';
import { getEffectiveWebResearchSettings } from './settings';

export async function requireWebResearchConfiguration() {
  const settings = await getEffectiveWebResearchSettings();
  const connector = getWebResearchConnector(settings.provider);
  if (!settings.enabled || !settings.apiKey || !connector) {
    throw new DomainError('AI_FEATURE_DISABLED', 'Web research is not currently available');
  }
  return { settings, connector, apiKey: settings.apiKey };
}
