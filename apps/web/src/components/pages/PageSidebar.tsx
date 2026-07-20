import { ReaderTags } from './ReaderTags';
import type { PageTag } from './TagList';
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
    <aside
      className="scrollbar-hidden hidden min-w-0 space-y-md border-l border-border px-md py-md xl:sticky xl:top-0 xl:block xl:max-h-screen xl:overflow-y-auto"
      aria-label={outlineLabel}
    >
      {hasTags && (
        <div className="rounded-lg border border-border bg-surface p-sm">
          <p className="mb-sm border-b border-border pb-sm text-sm font-medium text-foreground">{tagsLabel}</p>
          <ReaderTags tags={tags} ariaLabel={tagsLabel} />
        </div>
      )}
      {hasOutline && (
        <nav className="flex flex-col rounded-lg border border-border bg-surface">
          <p className="border-b border-border p-sm text-sm font-medium text-foreground">{outlineLabel}</p>
          <ul className="p-sm">
            {headings.map((heading) => (
              <li key={heading.id}>
                <a
                  href={`#${heading.id}`}
                  className="block rounded-md px-sm py-1 text-sm text-muted transition-colors hover:bg-surface-elevated hover:text-foreground"
                  style={{ paddingLeft: `${(heading.level - 2) * 0.75 + 0.5}rem` }}
                >
                  {heading.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </aside>
  );
}
