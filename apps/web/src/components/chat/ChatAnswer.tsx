'use client';

import { useMemo } from 'react';
import type { AiCitation } from '@next-wiki/shared';
import { ChatMarkdown } from './ChatMarkdown';
import { linkifyCitationMarkers } from './linkify-citations';

/**
 * Renders an assistant answer as Markdown, with citation markers turned into
 * links to the pages they cite.
 */
export function ChatAnswer({ text, citations, done }: { text: string; citations?: AiCitation[]; done: boolean }) {
  const source = useMemo(() => linkifyCitationMarkers(text, citations), [text, citations]);
  return <ChatMarkdown source={source} done={done} />;
}
