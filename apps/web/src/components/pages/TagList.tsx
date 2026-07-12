export type PageTag = { id: string; name: string; normalizedName: string };

export function TagList({ tags, ariaLabel }: { tags: PageTag[]; ariaLabel?: string }) {
  return (
    <ul className="flex flex-wrap gap-xs" aria-label={ariaLabel}>
      {tags.map((tag) => (
        <li key={tag.id} className="rounded-full bg-muted px-sm py-0.5 text-xs text-foreground">{tag.name}</li>
      ))}
    </ul>
  );
}
