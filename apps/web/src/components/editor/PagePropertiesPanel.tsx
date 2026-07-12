import { ModalDialog } from '@/components/ui/ModalDialog';
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
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <ModalDialog title={t('editor.properties.title')} onClose={onClose} maxWidth="max-w-md">
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
      />
    </ModalDialog>
  );
}
