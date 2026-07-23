import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApplicationI18nProvider } from '@/components/i18n/ApplicationI18nProvider';
import { getMessages } from '@/i18n/catalog';
import { ApiProvider } from '@/lib/api/provider';
import { BotGeneralSettingsPanel } from './BotGeneralSettingsPanel';

describe('BotGeneralSettingsPanel', () => {
  it('renders the configured Wiki answer relevance threshold', () => {
    const html = renderToStaticMarkup(
      <ApiProvider>
        <ApplicationI18nProvider initialLocale="en" messages={getMessages('en')}>
          <BotGeneralSettingsPanel initial={{ wikiQuestionMinRelevanceScore: 0.63, updatedAt: null }} />
        </ApplicationI18nProvider>
      </ApiProvider>,
    );
    expect(html).toContain('Wiki answer retrieval');
    expect(html).toContain('Minimum relevance score');
    expect(html).toContain('value="0.63"');
  });
});
