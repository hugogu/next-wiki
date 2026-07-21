import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ConversationSessionViewModel } from '@next-wiki/shared';
import { ApplicationI18nProvider } from '@/components/i18n/ApplicationI18nProvider';
import { getMessages } from '@/i18n/catalog';
import { ConversationSessionView } from './ConversationSessionView';

function conversation(overrides: Partial<ConversationSessionViewModel> = {}): ConversationSessionViewModel {
  return {
    status: 'completed',
    question: 'Where is the deployment config?',
    answer: 'It lives in docker-compose.yml.',
    thinking: '',
    citations: [],
    insufficient: false,
    errorMessage: null,
    ...overrides,
  };
}

function render(model: ConversationSessionViewModel): string {
  return renderToStaticMarkup(
    <ApplicationI18nProvider initialLocale="en" messages={getMessages('en')}>
      <ConversationSessionView conversation={model} />
    </ApplicationI18nProvider>,
  );
}

describe('ConversationSessionView', () => {
  it('renders the question, answer, and a completed status badge', () => {
    const html = render(conversation());
    expect(html).toContain('Where is the deployment config?');
    expect(html).toContain('It lives in docker-compose.yml.');
    expect(html).toContain('Completed');
  });

  it('shows the insufficient-evidence notice instead of an empty answer', () => {
    const html = render(conversation({ insufficient: true, answer: '' }));
    expect(html).toContain('The Wiki does not contain enough evidence to answer.');
    expect(html).not.toContain('No answer yet.');
  });

  it('shows the error message instead of the answer when the conversation failed', () => {
    const html = render(conversation({ status: 'failed', errorMessage: 'The provider timed out.', answer: '' }));
    expect(html).toContain('The provider timed out.');
    expect(html).toContain('Failed');
  });

  it('shows a running badge and a no-answer placeholder for a running session with no text yet', () => {
    const html = render(conversation({ status: 'running', answer: '', citations: [] }));
    expect(html).toContain('Running');
    expect(html).toContain('No answer yet.');
  });

  it('shows partial answer text for a running session that has streamed content', () => {
    const html = render(conversation({ status: 'running', answer: 'Partial answer so far' }));
    expect(html).toContain('Running');
    expect(html).toContain('Partial answer so far');
  });

  it('renders open thinking for a still-running session and citations regardless of status', () => {
    const html = render(conversation({
      status: 'running',
      thinking: 'Considering the docker-compose file...',
      citations: [{ pageId: '00000000-0000-4000-8000-000000000001', title: 'Deploy Guide', path: 'ops/deploy', locale: 'en', revisionId: '00000000-0000-4000-9000-000000000001', revisionHash: 'h' }],
    }));
    expect(html).toContain('Considering the docker-compose file...');
    expect(html).toContain('Deploy Guide');
  });
});
