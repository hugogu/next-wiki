import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AiRuntimeSettingsView } from '@next-wiki/shared';
import { ApplicationI18nProvider } from '@/components/i18n/ApplicationI18nProvider';
import { getMessages } from '@/i18n/catalog';
import { AiPromptsPanel } from './AiPromptsPanel';

function view(overrides: Partial<AiRuntimeSettingsView['prompts']> = {}): AiRuntimeSettingsView {
  return {
    params: { toolMaxCalls: 100, plannerTemperature: 0.1, plannerMaxOutputTokens: null, plannerTimeoutMs: 120000 },
    prompts: { assistantSystemPrompt: null, toolSystemPrompt: null, ...overrides },
    defaults: {
      assistantSystemPrompt: 'You are Wiki AI.',
      toolSystemPrompt: 'Available tools:\n{{TOOLS}}',
    },
  };
}

function render(model: AiRuntimeSettingsView): string {
  return renderToStaticMarkup(
    <ApplicationI18nProvider initialLocale="en" messages={getMessages('en')}>
      <AiPromptsPanel initial={model} />
    </ApplicationI18nProvider>,
  );
}

describe('AiPromptsPanel', () => {
  it('renders both prompt editors with their labels', () => {
    const html = render(view());
    expect(html).toContain('Assistant system prompt');
    expect(html).toContain('Tool system prompt');
  });

  it('shows the built-in default as placeholder and the using-default state when no override', () => {
    const html = render(view());
    expect(html).toContain('You are Wiki AI.');
    expect(html).toContain('{{TOOLS}}');
    expect(html).toContain('Using default');
  });

  it('shows the stored override value when configured', () => {
    const html = render(view({ assistantSystemPrompt: 'Custom persona prompt' }));
    expect(html).toContain('Custom persona prompt');
  });
});
