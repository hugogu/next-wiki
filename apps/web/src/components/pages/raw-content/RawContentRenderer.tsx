import { ContentRenderer } from '@/components/renderer/ContentRenderer';

export type RawContentLabels = {
  download: string;
  pdfTitle: string;
  imageAlt: string;
  noViewer: string;
};

function normalizeType(contentType: string): string {
  return contentType.split(';')[0]!.trim().toLowerCase();
}

function prettyJson(source: string): string {
  try {
    return JSON.stringify(JSON.parse(source), null, 2);
  } catch {
    return source;
  }
}

/**
 * Renders a raw entry's body by its declared content type (022 dual-track). PDFs
 * and images render from the immutable original bytes served at
 * `/api/raw-assets/{id}`; textual formats render the extracted text; a "Download
 * original" affordance is offered whenever an original-bytes asset exists. A
 * server component — no interactivity beyond native iframe/img/anchor.
 */
export function RawContentRenderer({
  contentType,
  contentSource,
  originalAssetId,
  markdownHtml,
  labels,
}: {
  contentType: string;
  contentSource: string;
  originalAssetId: string | null;
  markdownHtml: string;
  labels: RawContentLabels;
}) {
  const type = normalizeType(contentType);
  const assetUrl = originalAssetId ? `/api/raw-assets/${originalAssetId}` : null;

  let body: React.ReactNode;
  let notice: string | null = null;
  if (type === 'application/pdf' && assetUrl) {
    body = <iframe src={assetUrl} title={labels.pdfTitle} className="h-[80vh] w-full rounded border border-border" />;
  } else if (type.startsWith('image/') && assetUrl) {
    // Served from an Admin-gated dynamic route (not a public/static image), so
    // next/image optimization does not apply.
    // eslint-disable-next-line @next/next/no-img-element
    body = <img src={assetUrl} alt={labels.imageAlt} className="max-w-full rounded border border-border" />;
  } else if (type === 'application/json') {
    body = <pre className="overflow-x-auto rounded border border-border bg-surface p-md font-mono text-sm">{prettyJson(contentSource)}</pre>;
  } else if (type === 'text/x-log' || type === 'text/plain') {
    body = <pre className="overflow-x-auto whitespace-pre-wrap rounded border border-border bg-surface p-md font-mono text-sm">{contentSource}</pre>;
  } else if (type === 'text/markdown') {
    body = <ContentRenderer html={markdownHtml} />;
  } else {
    // text/html is rendered as escaped plain text (no sanitizer is wired), and
    // any unrecognized type falls back to plain text with a notice.
    body = <pre className="overflow-x-auto whitespace-pre-wrap rounded border border-border bg-surface p-md font-mono text-sm">{contentSource}</pre>;
    if (type !== 'text/html') notice = labels.noViewer;
  }

  return (
    <div className="space-y-md" data-testid="raw-content" data-content-type={type}>
      {notice && <p className="text-sm text-muted">{notice}</p>}
      {body}
      {assetUrl && (
        <p>
          <a
            href={`${assetUrl}?download=1`}
            className="inline-flex items-center gap-xs text-sm font-medium text-primary hover:underline"
            download
          >
            {labels.download}
          </a>
        </p>
      )}
    </div>
  );
}
