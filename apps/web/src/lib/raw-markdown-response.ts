import { MARKDOWN_CONTENT_TYPE_HEADER, UNSUPPORTED_STATUS_CODE, type RawMarkdownResult } from '@/server/services/raw-markdown-export';

export function rawMarkdownResultToResponse(result: RawMarkdownResult): Response {
  switch (result.kind) {
    case 'ok':
      return new Response(result.content, {
        headers: {
          'Content-Type': MARKDOWN_CONTENT_TYPE_HEADER,
          'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(result.title)}.md`,
        },
      });
    case 'unavailable':
    case 'not_found':
      return new Response('Not Found', { status: 404 });
    case 'unsupported':
      return new Response(`Unsupported content type: ${result.contentType}`, { status: UNSUPPORTED_STATUS_CODE });
    case 'forbidden':
      return new Response('Forbidden', { status: 403 });
  }
}
