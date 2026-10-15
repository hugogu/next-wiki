import { OUTLINE_BODY_ID } from '@/lib/outline-preference';
import { OutlineToggle } from './OutlineToggle';
import { ReaderTags } from './ReaderTags';
import type { PageTag } from './TagList';
import type { Heading } from '@/lib/html';

type PageSidebarProps = {
  headings: Heading[];
  tags: PageTag[];
  tagsLabel: string;
  outlineLabel: string;
  outlineCollapseLabel: string;
  outlineExpandLabel: string;
};

/**
 * The reader's right-hand sidebar. A page with an Outline can fold the whole
 * sidebar away to a thin rail at the page edge so the article gets the room: both
 * the sidebar and the rail are always in the page, and the stylesheet shows one
 * of them according to the saved choice (see `.reader-sidebar` in globals.css).
 * A sidebar that only carries tags has nothing to toggle and is never collapsed.
 */
export function PageSidebar({
  headings,
  tags,
  tagsLabel,
  outlineLabel,
  outlineCollapseLabel,
  outlineExpandLabel,
}: PageSidebarProps) {
  const hasOutline = headings.length > 0;
  const hasTags = tags.length > 0;

  if (!hasOutline && !hasTags) return null;

  return (
    <aside
      className="reader-sidebar scrollbar-hidden hidden min-w-0 border-l border-border px-md py-md xl:sticky xl:top-0 xl:block xl:max-h-screen xl:overflow-y-auto"
      aria-label={outlineLabel}
      data-collapsible={hasOutline || undefined}
    >
      <div id={OUTLINE_BODY_ID} className="reader-sidebar-body space-y-md">
        {hasTags && (
          <div className="rounded-lg border border-border bg-surface p-sm">
            <p className="mb-sm border-b border-border pb-sm text-sm font-medium text-foreground">{tagsLabel}</p>
            <ReaderTags tags={tags} ariaLabel={tagsLabel} />
          </div>
        )}
        {hasOutline && (
          <nav className="flex flex-col rounded-lg border border-border bg-surface">
            <div className="flex items-center justify-between gap-sm border-b border-border p-sm">
              <p className="text-sm font-medium text-foreground">{outlineLabel}</p>
              <OutlineToggle collapse label={outlineCollapseLabel} />
            </div>
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
      </div>
      {hasOutline && (
        <div className="reader-sidebar-rail">
          <OutlineToggle collapse={false} label={outlineExpandLabel} />
        </div>
      )}
    </aside>
  );
}
