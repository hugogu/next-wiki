import { ModalDialog } from '@/components/ui/ModalDialog';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { useTranslation } from '@/i18n/client';
import { PagePropertiesFields } from './PagePropertiesFields';

export function PagePropertiesPanel({
  title,
  onTitleChange,
  titleError,
  path,
  onPathChange,
  pathError,
  pathReadOnly = false,
  date,
  onDateChange,
  tags,
  onTagsChange,
  summary,
  onSummaryChange,
  writeMetadataToFrontmatter,
  onWriteMetadataToFrontmatterChange,
  error,
  saving = false,
  onSave,
  onClose,
}: {
  title: string;
  onTitleChange: (value: string) => void;
  titleError?: string;
  path: string;
  onPathChange: (value: string) => void;
  pathError?: string;
  pathReadOnly?: boolean;
  date?: string;
  onDateChange?: (value: string) => void;
  tags?: string;
  onTagsChange?: (value: string) => void;
  summary?: string;
  onSummaryChange?: (value: string) => void;
  writeMetadataToFrontmatter?: boolean;
  onWriteMetadataToFrontmatterChange?: (value: boolean) => void;
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
          date={date}
          onDateChange={onDateChange}
          tags={tags}
          onTagsChange={onTagsChange}
          summary={summary}
          onSummaryChange={onSummaryChange}
          writeMetadataToFrontmatter={writeMetadataToFrontmatter}
          onWriteMetadataToFrontmatterChange={onWriteMetadataToFrontmatterChange}
        />

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
