import { NextResponse } from 'next/server';
import { z } from 'zod';
import { renderMarkdown } from '@/server/pipeline';

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
    const { html } = renderMarkdown(parsed.data.contentSource);
    return NextResponse.json({ html });
  } catch {
    return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Failed to render preview' }, { status: 500 });
  }
}
