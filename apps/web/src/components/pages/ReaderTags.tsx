'use client';

import { EditableTagList } from './EditableTagList';
import { usePageEdit } from './PageEditContext';
import type { PageTag } from './TagList';

/** Reader-sidebar tags: read-only for visitors, editable for editors/admins
 * (capability resolved from the hydrated session via PageEditContext). */
export function ReaderTags({ tags, ariaLabel }: { tags: PageTag[]; ariaLabel?: string }) {
  const { canEdit, pageId } = usePageEdit();
  return (
    <EditableTagList
      tags={tags}
      pageId={pageId}
      canEdit={canEdit}
      ariaLabel={ariaLabel}
      tagHref={(tag) => `/tags/${encodeURIComponent(tag.normalizedName)}`}
    />
  );
}
