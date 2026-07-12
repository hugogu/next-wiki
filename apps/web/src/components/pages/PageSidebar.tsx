import { TagList, type PageTag } from './TagList';
import type { Heading } from '@/lib/html';

type PageSidebarProps = {
  headings: Heading[];
  tags: PageTag[];
  tagsLabel: string;
  outlineLabel: string;
};

export function PageSidebar({ headings, tags, tagsLabel, outlineLabel }: PageSidebarProps) {
  const hasOutline = headings.length > 0;
  const hasTags = tags.length > 0;

  if (!hasOutline && !hasTags) return null;

  return (
    <aside className="space-y-md lg:sticky lg:top-0 lg:self-start" aria-label={outlineLabel}>
      {hasOutline && (
        <nav className="rounded-lg border border-border bg-surface p-md">
          <p className="mb-sm text-sm font-medium text-foreground">{outlineLabel}</p>
          <ul className="space-y-xs">
            {headings.map((heading) => (
              <li key={heading.id}>
                <a
                  href={`#${heading.id}`}
                  className="block text-sm text-muted hover:text-foreground hover:underline"
                  style={{ paddingLeft: `${(heading.level - 2) * 0.75}rem` }}
                >
                  {heading.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {hasTags && (
        <div className="rounded-lg border border-border bg-surface p-md">
          <p className="mb-sm text-sm font-medium text-foreground">{tagsLabel}</p>
          <TagList tags={tags} ariaLabel={tagsLabel} />
        </div>
      )}
    </aside>
  );
}
