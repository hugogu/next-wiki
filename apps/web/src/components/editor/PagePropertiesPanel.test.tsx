// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n/client';
import enMessages from '../../../messages/en.json';
import { PagePropertiesPanel } from './PagePropertiesPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(props: Partial<React.ComponentProps<typeof PagePropertiesPanel>> = {}) {
  return renderToStaticMarkup(
    <I18nProvider initialLocale="en" messages={enMessages}>
      <PagePropertiesPanel
        title="My page"
        onTitleChange={() => undefined}
        path="docs/intro"
        onPathChange={() => undefined}
        onSave={() => undefined}
        onClose={() => undefined}
        {...props}
      />
    </I18nProvider>,
  );
}

describe('PagePropertiesPanel save button', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders a Save properties button so the user can validate and persist without delaying to page save', () => {
    const html = render();
    expect(html).toMatch(/Save properties|Save/);
    // A cancel control should be present too so the dialog can be dismissed
    // without persisting an in-flight edit.
    expect(html).toMatch(/Cancel/);
  });

  it('disables both buttons while a save is in flight', () => {
    const html = render({ saving: true });
    expect(html).toContain('Saving...');
    // Both buttons should carry disabled attributes while saving is true.
    const buttons = html.match(/<button[^>]*disabled[^>]*>/g) ?? [];
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it('renders server-side validation errors (e.g. reserved-path) inline above the action row', () => {
    const html = render({
      error: 'This path is reserved by built-in functionality. Please choose a different path.',
    });
    expect(html).toContain('reserved by built-in functionality');
    expect(html).toContain('role="alert"');
  });
});
