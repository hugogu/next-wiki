import { TagIcon } from '@/components/icons';

export type PageTag = { id: string; name: string; normalizedName: string };

/** Tag chips shared by the reader and share views. Mirrors the admin Tags
 * surface styling (outlined pill + tag glyph) so the two stay visually
 * consistent and legible against the page background. */
export function TagList({ tags, ariaLabel }: { tags: PageTag[]; ariaLabel?: string }) {
  return (
    <ul className="flex flex-wrap items-center gap-xs" aria-label={ariaLabel}>
      {tags.map((tag) => (
        <li
          key={tag.id}
          className="inline-flex items-center gap-xs rounded-full border border-border px-sm py-[2px] text-xs text-muted"
        >
          <TagIcon className="h-3 w-3 shrink-0" />
          {tag.name}
        </li>
      ))}
    </ul>
  );
}
