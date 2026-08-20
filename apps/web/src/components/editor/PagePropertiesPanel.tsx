import { ModalDialog } from '@/components/ui/ModalDialog';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { useTranslation } from '@/i18n/client';
import { AttachmentsPanel } from '@/components/page/AttachmentsPanel';
import { PagePropertiesFields } from './PagePropertiesFields';

export function PagePropertiesPanel({
  pageId,
  title,
  onTitleChange,
  titleError,
  path,
  onPathChange,
  pathError,
  pathReadOnly = false,
  slug,
  onSlugChange,
  slugError,
  date,
  onDateChange,
  tags,
  onTagsChange,
  summary,
  onSummaryChange,
  writeMetadataToFrontmatter,
  onWriteMetadataToFrontmatterChange,
  visibility,
  onVisibilityChange,
  error,
  saving = false,
  onSave,
  onClose,
}: {
  /** Omitted while creating a new, unsaved page — attachments need an
   * existing page to attach to. */
  pageId?: string;
  title: string;
  onTitleChange: (value: string) => void;
  titleError?: string;
  path?: string;
  onPathChange?: (value: string) => void;
  pathError?: string;
  pathReadOnly?: boolean;
  /** 035: the page's canonical public address. Omitted for a new, unsaved
   * page — the default slug is captured at creation, not edited here. */
  slug?: string;
  onSlugChange?: (value: string) => void;
  slugError?: string;
  date?: string;
  onDateChange?: (value: string) => void;
  tags?: string;
  onTagsChange?: (value: string) => void;
  summary?: string;
  onSummaryChange?: (value: string) => void;
  writeMetadataToFrontmatter?: boolean;
  onWriteMetadataToFrontmatterChange?: (value: boolean) => void;
  visibility?: 'public' | 'registered' | 'restricted';
  onVisibilityChange?: (value: 'public' | 'registered' | 'restricted') => void;
  error?: string | null;
  saving?: boolean;
  /** Called when the user clicks "Save properties". Triggers path validation
   * (server-side, including reserved-path) immediately, rather than deferring
   * to the page-save action. */
  onSave: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <ModalDialog title={t('editor.properties.title')} onClose={onClose} maxWidth="max-w-md">
      <div className="flex flex-col gap-md">
        <PagePropertiesFields
          title={title}
          onTitleChange={onTitleChange}
          titleError={titleError}
          path={path}
          onPathChange={onPathChange}
          pathError={pathError}
          pathReadOnly={pathReadOnly}
          slug={slug}
          onSlugChange={onSlugChange}
          slugError={slugError}
          date={date}
          onDateChange={onDateChange}
          tags={tags}
          onTagsChange={onTagsChange}
          summary={summary}
          onSummaryChange={onSummaryChange}
          writeMetadataToFrontmatter={writeMetadataToFrontmatter}
          onWriteMetadataToFrontmatterChange={onWriteMetadataToFrontmatterChange}
          visibility={visibility}
          onVisibilityChange={onVisibilityChange}
        />

        {pageId && (
          <div className="border-t border-border pt-md">
            <AttachmentsPanel pageId={pageId} canManage />
          </div>
        )}

        {error && <Alert>{error}</Alert>}

        <div className="flex justify-end gap-sm">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.actions.cancel')}
          </Button>
          <Button type="button" onClick={onSave} disabled={saving}>
            {saving ? t('page.properties.button.submitting') : t('page.properties.button.submit')}
          </Button>
        </div>
      </div>
    </ModalDialog>
  );
}
