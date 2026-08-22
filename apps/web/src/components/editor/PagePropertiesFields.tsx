import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Tooltip } from '@/components/ui/Tooltip';
import { InfoIcon } from '@/components/icons';
import { useTranslation } from '@/i18n/client';
import { EditableTagList } from '@/components/pages/EditableTagList';
import type { PageTag } from '@/components/pages/TagList';

/** `tags`/`onTagsChange` here stay a comma-joined string — the wire format
 * every caller (and the frontmatter it eventually feeds) already uses —
 * while `EditableTagList` itself works in terms of tag objects. Converting
 * at this boundary means no caller needs to change to get the shared
 * chip-based picker instead of free-text entry. */
function parseTagsString(value: string): PageTag[] {
  return value
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ id: name, name, normalizedName: name.toLocaleLowerCase() }));
}

export function PagePropertiesFields({
  title,
  onTitleChange,
  titleError,
  path,
  onPathChange,
  pathError,
  pathReadOnly = false,
  pathLabel,
  pathHint,
  addressPreview,
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
  pathLabel?: string;
  pathHint?: string;
  /** 035: the public address this page will be reachable at, shown before
   * saving. Only meaningful where the path is still editable (creation). */
  addressPreview?: string;
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
          <label className="block text-sm font-medium mb-xs">{t('editor.properties.fields.tagsLabel')}</label>
          <EditableTagList
            tags={parseTagsString(tags ?? '')}
            canEdit
            autoSave={false}
            ariaLabel={t('editor.properties.fields.tagsLabel')}
            onChange={(next) => onTagsChange(next.map((tag) => tag.name).join(', '))}
          />
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

      {path !== undefined && onPathChange && (
        <div>
          <div className="flex items-center gap-xs mb-xs">
            <label htmlFor="prop-path" className="block text-sm font-medium">
              {pathLabel ?? t('editor.properties.fields.pathLabel')}
            </label>
            {!pathReadOnly && (
              <Tooltip label={pathHint ?? t('editor.properties.fields.pathHint', { example: 'docs/getting-started' })}>
                <button
                  type="button"
                  className="inline-flex rounded-sm text-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  aria-label={t('editor.properties.fields.pathHintLabel')}
                >
                  <InfoIcon className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </Tooltip>
            )}
          </div>
          <Input
            id="prop-path"
            value={path}
            onChange={(e) => !pathReadOnly && onPathChange(e.target.value)}
            placeholder={t('editor.properties.fields.pathPlaceholder')}
            aria-label={pathLabel ?? t('editor.properties.fields.pathLabel')}
            disabled={pathReadOnly}
          />
          {pathError && <p className="text-danger text-xs mt-xs">{pathError}</p>}
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
