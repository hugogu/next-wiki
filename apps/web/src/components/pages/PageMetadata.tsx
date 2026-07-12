type PageMetadataProps = {
  date: string | null;
  summary: string | null;
  tags: { id: string; name: string; normalizedName: string }[];
  labels: { date: string; summary: string; tags: string };
};

/** Reader-facing projection of typed revision metadata. Values are rendered as
 * plain text so authored summaries cannot alter article structure. */
export function PageMetadata({ date, summary, tags, labels }: PageMetadataProps) {
  if (!date && !summary && tags.length === 0) return null;
  return (
    <section aria-label={labels.summary} className="mb-lg rounded-lg border border-border bg-surface px-md py-sm text-sm text-muted">
      {date && <p><span className="font-medium text-foreground">{labels.date}: </span>{date}</p>}
      {summary && <p className="mt-xs"><span className="font-medium text-foreground">{labels.summary}: </span>{summary}</p>}
      {tags.length > 0 && (
        <div className="mt-xs flex flex-wrap items-center gap-xs">
          <span className="font-medium text-foreground">{labels.tags}:</span>
          <TagList tags={tags} ariaLabel={labels.tags} />
        </div>
      )}
    </section>
  );
}
import { TagList } from './TagList';
