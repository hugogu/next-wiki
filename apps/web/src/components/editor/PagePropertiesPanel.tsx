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
  onClose,
}: {
  title: string;
  onTitleChange: (value: string) => void;
  titleError?: string;
  path: string;
  onPathChange: (value: string) => void;
  pathError?: string;
  pathReadOnly?: boolean;
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
      />
    </ModalDialog>
  );
}
