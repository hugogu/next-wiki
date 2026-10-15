import { OutlineNav } from './OutlineNav';
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
        <OutlineNav
          headings={headings}
          label={outlineLabel}
          collapseLabel={outlineCollapseLabel}
          expandLabel={outlineExpandLabel}
        />
      )}
    </aside>
  );
}
