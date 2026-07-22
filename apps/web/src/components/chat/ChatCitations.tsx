import type { AiCitation } from '@next-wiki/shared';
import { getCitationHref } from '@/lib/path';

export function ChatCitations({ citations }: { citations?: AiCitation[] }) {
  if (!citations?.length) return null;
  return (
    <ul className="mt-sm space-y-xs border-t border-border pt-sm text-xs">
      {citations.map((citation) => (
        <li key={`${citation.pageId}:${citation.revisionId}`}>
          <a className="text-primary hover:underline" href={getCitationHref(citation)}>{citation.title}</a>
        </li>
      ))}
    </ul>
  );
}
