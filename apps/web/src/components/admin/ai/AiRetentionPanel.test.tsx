import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AI_EVENT_RETENTION_HOURS_MAX } from '@next-wiki/shared';
import { ApplicationI18nProvider } from '@/components/i18n/ApplicationI18nProvider';
import { getMessages } from '@/i18n/catalog';

import { AiRetentionPanel } from './AiRetentionPanel';

function render(props: { eventRetentionHours: number; artifactRetentionHours: number }) {
  return renderToStaticMarkup(
    <ApplicationI18nProvider initialLocale="en" messages={getMessages('en')}>
      <AiRetentionPanel {...props} />
    </ApplicationI18nProvider>,
  );
}

describe('AiRetentionPanel', () => {
  it('shows the stored retention values', () => {
    const html = render({ eventRetentionHours: 720, artifactRetentionHours: 24 });
    expect(html).toContain('value="720"');
    expect(html).toContain('value="24"');
  });

  it('offers the full event-log ceiling, not the artifact one', () => {
    const html = render({ eventRetentionHours: 720, artifactRetentionHours: 24 });
    expect(AI_EVENT_RETENTION_HOURS_MAX).toBe(8_760);
    expect(html).toContain(`max="${AI_EVENT_RETENTION_HOURS_MAX}"`);
    expect(html).toContain('max="168"');
  });
});
