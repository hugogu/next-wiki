type Props = {
  html: string;
  title: string;
  summary?: string | null;
};

// Shared page content display component used by public view and editor preview.
export function PageView({ html, title, summary }: Props) {
  return (
    <article>
      <h1 className="mb-4 text-3xl font-bold text-text-primary">{title}</h1>
      {summary && <p className="mb-6 text-text-secondary">{summary}</p>}
      <div className="prose prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
