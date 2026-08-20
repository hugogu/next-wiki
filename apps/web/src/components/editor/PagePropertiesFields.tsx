import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useTranslation } from '@/i18n/client';
import { TagPicker } from '@/components/pages/TagPicker';

export function PagePropertiesFields({
  title,
  onTitleChange,
  titleError,
  path,
  onPathChange,
  pathError,
  pathReadOnly = false,
  addressPreview,
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
}: {
  title: string;
  onTitleChange: (value: string) => void;
  titleError?: string;
  path?: string;
  onPathChange?: (value: string) => void;
  pathError?: string;
  pathReadOnly?: boolean;
  /** 035: the public address this page will be reachable at, shown before
   * saving. Only meaningful where the path is still editable (creation). */
  addressPreview?: string;
  /** 035: the page's canonical public address (distinct from `path`).
   * Omitted while creating a new page — the default is captured at creation
   * and shown via `addressPreview` instead. */
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

      {onDateChange && (
        <div>
          <label htmlFor="prop-date" className="block text-sm font-medium mb-xs">{t('editor.properties.fields.dateLabel')}</label>
          <Input id="prop-date" type="date" value={date ?? ''} onChange={(e) => onDateChange(e.target.value)} aria-label={t('editor.properties.fields.dateLabel')} />
        </div>
      )}
      {onTagsChange && (
        <div>
          <label htmlFor="prop-tags" className="block text-sm font-medium mb-xs">{t('editor.properties.fields.tagsLabel')}</label>
          <TagPicker value={tags ?? ''} onChange={onTagsChange} />
          <p className="text-xs text-muted mt-xs">{t('editor.properties.fields.tagsHint')}</p>
        </div>
      )}
      {onSummaryChange && (
        <div>
          <label htmlFor="prop-summary" className="block text-sm font-medium mb-xs">{t('editor.properties.fields.summaryLabel')}</label>
          <textarea id="prop-summary" value={summary ?? ''} onChange={(e) => onSummaryChange(e.target.value)} aria-label={t('editor.properties.fields.summaryLabel')} className="min-h-24 w-full rounded-md border border-border bg-background px-sm py-sm text-sm text-foreground" />
        </div>
      )}

      {onWriteMetadataToFrontmatterChange && (
        <label className="flex items-start gap-sm rounded-md border border-border bg-background p-sm">
          <input
            type="checkbox"
            checked={writeMetadataToFrontmatter ?? false}
            onChange={(event) => onWriteMetadataToFrontmatterChange(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary/50"
          />
          <span>
            <span className="block text-sm font-medium">{t('editor.properties.fields.frontmatterLabel')}</span>
            <span className="mt-xs block text-xs text-muted">{t('editor.properties.fields.frontmatterHint')}</span>
          </span>
        </label>
      )}

      {onVisibilityChange && visibility && (
        <div>
          <label htmlFor="prop-visibility" className="block text-sm font-medium mb-xs">
            {t('editor.properties.fields.visibilityLabel')}
          </label>
          <Select
            id="prop-visibility"
            value={visibility}
            onChange={(event) => onVisibilityChange(event.target.value as 'public' | 'registered' | 'restricted')}
            aria-label={t('editor.properties.fields.visibilityLabel')}
          >
            <option value="restricted">{t('editor.properties.fields.visibilityRestricted')}</option>
            <option value="registered">{t('editor.properties.fields.visibilityRegistered')}</option>
            <option value="public">{t('editor.properties.fields.visibilityPublic')}</option>
          </Select>
        </div>
      )}

      {slug !== undefined && onSlugChange && (
        <div>
          <label htmlFor="prop-slug" className="block text-sm font-medium mb-xs">
            {t('editor.properties.fields.slugLabel')}
          </label>
          <Input
            id="prop-slug"
            value={slug}
            onChange={(e) => onSlugChange(e.target.value)}
            placeholder={t('editor.properties.fields.slugPlaceholder')}
            aria-label={t('editor.properties.fields.slugLabel')}
          />
          {slugError && <p className="text-danger text-xs mt-xs">{slugError}</p>}
          {!slugError && <p className="text-xs text-muted mt-xs">{t('editor.properties.fields.slugHint')}</p>}
        </div>
      )}

      {path !== undefined && onPathChange && (
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
          {!pathReadOnly && addressPreview && (
            <p className="text-xs text-muted mt-xs">
              {t('editor.properties.fields.addressPreview', { address: addressPreview })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
