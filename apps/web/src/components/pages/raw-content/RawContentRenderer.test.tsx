import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ConversationSessionViewModel } from '@next-wiki/shared';
import { ApplicationI18nProvider } from '@/components/i18n/ApplicationI18nProvider';
import { getMessages } from '@/i18n/catalog';
import { RawContentRenderer, type RawContentLabels } from './RawContentRenderer';

const labels: RawContentLabels = {
  download: 'Download original',
  pdfTitle: 'PDF preview',
  imageAlt: 'Raw image',
  noViewer: 'No dedicated viewer for this content type; showing the extracted text.',
  invalidConversation: "This conversation's structured detail is unavailable right now.",
};

function render(children: React.ReactNode): string {
  return renderToStaticMarkup(
    <ApplicationI18nProvider initialLocale="en" messages={getMessages('en')}>
      {children}
    </ApplicationI18nProvider>,
  );
}

const conversation: ConversationSessionViewModel = {
  status: 'completed',
  question: 'Where is the deployment config?',
  answer: 'It lives in docker-compose.yml.',
  thinking: '',
  citations: [],
  insufficient: false,
  errorMessage: null,
};

describe('RawContentRenderer dispatch (023)', () => {
  it('renders the shared ConversationSessionView for the built-in Conversation category', () => {
    const html = render(
      <RawContentRenderer
        contentType="text/markdown"
        contentSource="# Question\n\nWhere is the deployment config?"
        originalAssetId={null}
        markdownHtml="<h1>Question</h1>"
        labels={labels}
        rawCategorySystemKey="conversation"
        conversation={conversation}
      />,
    );
    expect(html).toContain('Where is the deployment config?');
    expect(html).toContain('It lives in docker-compose.yml.');
    expect(html).not.toContain('data-testid="raw-content"');
  });

  it('shows a non-sensitive fallback notice when Conversation metadata is missing or invalid', () => {
    const html = render(
      <RawContentRenderer
        contentType="text/markdown"
        contentSource="# Question"
        originalAssetId={null}
        markdownHtml="<h1>Question</h1>"
        labels={labels}
        rawCategorySystemKey="conversation"
        conversation={null}
      />,
    );
    expect(html).toContain('structured detail is unavailable right now.');
    expect(html).toContain('data-testid="raw-content-conversation-invalid"');
  });

  it('falls back to generic type-based rendering for a non-system (user-managed) category', () => {
    const html = render(
      <RawContentRenderer
        contentType="text/plain"
        contentSource="plain log line"
        originalAssetId={null}
        markdownHtml=""
        labels={labels}
        rawCategorySystemKey={null}
      />,
    );
    expect(html).toContain('plain log line');
    expect(html).toContain('data-testid="raw-content"');
  });

  it('renders Markdown content for text/markdown outside the Conversation category', () => {
    const html = render(
      <RawContentRenderer
        contentType="text/markdown"
        contentSource="# Title"
        originalAssetId={null}
        markdownHtml="<h1>Title</h1>"
        labels={labels}
      />,
    );
    expect(html).toContain('<h1>Title</h1>');
  });

  it('pretty-prints JSON content and shows an unrecognized-type notice for other types', () => {
    const json = render(
      <RawContentRenderer
        contentType="application/json"
        contentSource='{"a":1}'
        originalAssetId={null}
        markdownHtml=""
        labels={labels}
      />,
    );
    expect(json).toContain('&quot;a&quot;: 1');

    const unknown = render(
      <RawContentRenderer
        contentType="application/x-custom"
        contentSource="opaque body"
        originalAssetId={null}
        markdownHtml=""
        labels={labels}
      />,
    );
    expect(unknown).toContain('opaque body');
    expect(unknown).toContain('No dedicated viewer for this content type; showing the extracted text.');
  });

  it('offers a download link only when an original-bytes asset exists', () => {
    const withAsset = render(
      <RawContentRenderer
        contentType="application/pdf"
        contentSource=""
        originalAssetId="asset-1"
        markdownHtml=""
        labels={labels}
      />,
    );
    expect(withAsset).toContain('Download original');

    const withoutAsset = render(
      <RawContentRenderer
        contentType="text/plain"
        contentSource="no asset"
        originalAssetId={null}
        markdownHtml=""
        labels={labels}
      />,
    );
    expect(withoutAsset).not.toContain('Download original');
  });
});
