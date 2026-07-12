import Link from 'next/link';
import { TagIcon } from '@/components/icons';

export type PageTag = { id: string; name: string; normalizedName: string };

/** Tag chips shared by the reader and share views. Mirrors the admin Tags
 * surface styling (outlined pill + tag glyph) so the two stay visually
 * consistent and legible against the page background. */
export function TagList({
  tags,
  ariaLabel,
  tagHref,
}: {
  tags: PageTag[];
  ariaLabel?: string;
  tagHref?: (tag: PageTag) => string;
}) {
  return (
    <ul className="flex flex-wrap items-center gap-xs" aria-label={ariaLabel}>
      {tags.map((tag) => {
        const chip = (
          <>
            <TagIcon className="h-3 w-3 shrink-0" />
            {tag.name}
          </>
        );
        return (
          <li
            key={tag.id}
            className="inline-flex items-center gap-xs rounded-full border border-border px-sm py-[2px] text-xs text-muted transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
          >
            {tagHref ? (
              <Link href={tagHref(tag)} className="inline-flex items-center gap-xs">
                {chip}
              </Link>
            ) : (
              chip
            )}
          </li>
        );
      })}
    </ul>
  );
}
