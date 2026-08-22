// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '@/i18n/client';
import { ThemeProvider, useTheme } from '@/components/theme/ThemeProvider';
import enMessages from '../../../messages/en.json';
import { EmbedPreferencesBootstrap } from './EmbedPreferencesBootstrap';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount(ui: React.ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(ui));
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.documentElement.classList.remove('light', 'dark');
  document.documentElement.lang = '';
  localStorage.clear();
  history.pushState(null, '', '/');
});

function ThemeProbe() {
  const { resolved } = useTheme();
  return <span data-testid="resolved-theme">{resolved}</span>;
}

function harness() {
  return (
    <I18nProvider initialLocale="en" messages={enMessages}>
      <ThemeProvider>
        <EmbedPreferencesBootstrap />
        <ThemeProbe />
      </ThemeProvider>
    </I18nProvider>
  );
}

describe('EmbedPreferencesBootstrap', () => {
  it('applies ?lang and ?theme from the URL once on mount', () => {
    history.pushState(null, '', '/?lang=zh&theme=dark');
    mount(harness());

    expect(document.documentElement.lang).toBe('zh');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(container.querySelector('[data-testid="resolved-theme"]')?.textContent).toBe('dark');
  });

  it('ignores an unrecognized theme value and a missing lang param', () => {
    history.pushState(null, '', '/?theme=neon');
    mount(harness());

    expect(document.documentElement.lang).not.toBe('zh');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('never forces dark mode when neither param is present', () => {
    history.pushState(null, '', '/');
    mount(harness());

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
