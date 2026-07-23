import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AiRuntimeSettingsView } from '@next-wiki/shared';
import { ApplicationI18nProvider } from '@/components/i18n/ApplicationI18nProvider';
import { getMessages } from '@/i18n/catalog';
import { AiRuntimeParamsPanel } from './AiRuntimeParamsPanel';

const view: AiRuntimeSettingsView = {
  params: { toolMaxCalls: 42, plannerTemperature: 0.25, plannerMaxOutputTokens: 32_768 },
  prompts: { assistantSystemPrompt: null, toolSystemPrompt: null },
  defaults: { assistantSystemPrompt: 'default assistant', toolSystemPrompt: 'default tool {{TOOLS}}' },
};

function render(): string {
  return renderToStaticMarkup(
    <ApplicationI18nProvider initialLocale="en" messages={getMessages('en')}>
      <AiRuntimeParamsPanel initial={view} />
    </ApplicationI18nProvider>,
  );
}

describe('AiRuntimeParamsPanel', () => {
  it('renders the runtime parameter fields with their current values', () => {
    const html = render();
    expect(html).toContain('AI runtime parameters');
    expect(html).toContain('Max tool calls per turn');
    expect(html).toContain('Planner temperature');
    expect(html).toContain('value="42"');
    expect(html).toContain('value="0.25"');
    expect(html).toContain('value="32768"');
    expect(html).not.toContain('Planner timeout');
  });
});
