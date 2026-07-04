import { Input } from '@/components/ui/Input';
import { useTranslation } from '@/i18n/client';

export function PagePropertiesFields({
  title,
  onTitleChange,
  titleError,
  path,
  onPathChange,
  pathError,
  pathReadOnly = false,
}: {
  title: string;
  onTitleChange: (value: string) => void;
  titleError?: string;
  path: string;
  onPathChange: (value: string) => void;
  pathError?: string;
  pathReadOnly?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-md">
      <div>
        <label htmlFor="prop-title" className="block text-sm font-medium mb-xs">
          {t('editor.properties.fields.titleLabel')}
        </label>
        <Input
          id="prop-title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder={t('editor.properties.fields.titlePlaceholder')}
          aria-label={t('editor.properties.fields.titleLabel')}
        />
        {titleError && <p className="text-danger text-xs mt-xs">{titleError}</p>}
      </div>

      <div>
        <label htmlFor="prop-path" className="block text-sm font-medium mb-xs">
          {t('editor.properties.fields.pathLabel')}
        </label>
        <Input
          id="prop-path"
          value={path}
          onChange={(e) => !pathReadOnly && onPathChange(e.target.value)}
          placeholder={t('editor.properties.fields.pathPlaceholder')}
          aria-label={t('editor.properties.fields.pathLabel')}
          disabled={pathReadOnly}
        />
        {pathError && <p className="text-danger text-xs mt-xs">{pathError}</p>}
        {!pathReadOnly && (
          <p className="text-xs text-muted mt-xs">
            {t('editor.properties.fields.pathHint', { example: 'docs/getting-started' })}
          </p>
        )}
      </div>
    </div>
  );
}
