import { Input } from '@/components/ui/Input';

export function PagePropertiesPanel({
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
  return (
    <div className="absolute inset-y-0 right-0 w-80 bg-surface border-l border-border shadow-lg z-20 p-lg flex flex-col gap-md">
      <h2 className="font-display text-lg font-semibold">Page properties</h2>

      <div>
        <label htmlFor="prop-title" className="block text-sm font-medium mb-xs">
          Title
        </label>
        <Input
          id="prop-title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Page title"
          aria-label="Title"
        />
        {titleError && <p className="text-danger text-xs mt-xs">{titleError}</p>}
      </div>

      <div>
        <label htmlFor="prop-path" className="block text-sm font-medium mb-xs">
          Path
        </label>
        <Input
          id="prop-path"
          value={path}
          onChange={(e) => !pathReadOnly && onPathChange(e.target.value)}
          placeholder="path/to/page"
          aria-label="Path"
          disabled={pathReadOnly}
        />
        {pathError && <p className="text-danger text-xs mt-xs">{pathError}</p>}
        {!pathReadOnly && (
          <p className="text-xs text-muted mt-xs">
            Use slashes to create directories, e.g. <code>docs/intro</code>.
          </p>
        )}
      </div>
    </div>
  );
}
