import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AiRuntimeSettingsView } from '@next-wiki/shared';
import { ApplicationI18nProvider } from '@/components/i18n/ApplicationI18nProvider';
import { getMessages } from '@/i18n/catalog';

let currentSearch = '';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/admin/ai/prompts',
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

import { AiPromptsPanel } from './AiPromptsPanel';

function view(overrides: Partial<AiRuntimeSettingsView['prompts']> = {}): AiRuntimeSettingsView {
  return {
    params: { toolMaxCalls: 100, plannerTemperature: 0.1, plannerMaxOutputTokens: 32_768, plannerTimeoutMs: 120000 },
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
  it('renders a tab for each prompt', () => {
    currentSearch = '';
    const html = render(view());
    expect(html).toContain('Assistant');
    expect(html).toContain('Tool');
  });

  it('shows the built-in default as editable content (not a placeholder) with the using-default state', () => {
    currentSearch = '';
    const html = render(view());
    // The default appears inside the textarea element, i.e. as its value.
    expect(html).toMatch(/<textarea[^>]*>[\s\S]*You are Wiki AI\.[\s\S]*<\/textarea>/);
    expect(html).toContain('Using default');
  });

  it('renders the tool prompt (with the {{TOOLS}} marker) on the tool tab', () => {
    currentSearch = 'tab=tool';
    const html = render(view());
    expect(html).toContain('{{TOOLS}}');
    // Regression: the help string mentions {{TOOLS}} and must be ICU-escaped so
    // next-intl renders it instead of falling back to the raw message key.
    expect(html).not.toContain('admin.ai.prompts.tool.help');
    expect(html).toContain('Keep the {{TOOLS}} marker');
  });

  it('shows a stored override value instead of the default', () => {
    currentSearch = '';
    const html = render(view({ assistantSystemPrompt: 'Custom persona prompt' }));
    expect(html).toContain('Custom persona prompt');
    // With an override in effect, the using-default marker is not shown.
    expect(html).not.toContain('Using default');
  });
});
