import { DomainError } from '@/server/errors';
import { getWebResearchConnector } from './registry';
import { getEffectiveWebResearchSettings } from './settings';

export async function requireWebResearchConfiguration() {
  let settings: Awaited<ReturnType<typeof getEffectiveWebResearchSettings>>;
  try {
    settings = await getEffectiveWebResearchSettings();
  } catch {
    throw new DomainError(
      'WEB_RESEARCH_UNAVAILABLE',
      'External web research credentials are invalid. Ask an administrator to reconfigure the connector.',
    );
  }
  const connector = getWebResearchConnector(settings.provider);
  if (!settings.enabled || !settings.apiKey || !connector) {
    throw new DomainError(
      'WEB_RESEARCH_UNAVAILABLE',
      'External web research is not configured. Ask an administrator to configure the connector first.',
    );
  }
  return { settings, connector, apiKey: settings.apiKey };
}
