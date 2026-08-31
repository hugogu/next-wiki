import { NextResponse } from 'next/server';
import { z } from 'zod';
import { renderMarkdown } from '@/server/pipeline';
import { logger } from '@/server/logger';

const previewSchema = z.object({
  contentSource: z.string(),
});

/**
 * Render markdown preview.
 *
 * @openapi
 * @summary Render markdown preview
 * @description Renders the provided markdown source to HTML without persisting anything.
 * @tag Preview
 * @body PreviewInput
 * @response PreviewOutput
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = previewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ code: 'BAD_REQUEST', message: 'Invalid input' }, { status: 400 });
  }

  try {
    // No page context, by design: this endpoint renders arbitrary submitted
    // Markdown for the editor's live pane and chat answers. `[[wikilinks]]`
    // therefore render as links addressed from the site root rather than
    // resolved against a space's pages — the stored render, which knows the
    // space, resolves them on save.
    const { html } = renderMarkdown(parsed.data.contentSource);
    return NextResponse.json({ html });
  } catch (error) {
    logger.exception('render markdown preview failed', error);
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Failed to render preview' }, { status: 500 });
  }
}
