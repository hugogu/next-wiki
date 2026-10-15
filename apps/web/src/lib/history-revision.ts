/** One revision as the History view needs it: loaded on demand, kept for the visit. */
export type HistoryRevision = {
  version: number;
  contentSource: string;
  contentHtml: string;
  /** Frontmatter lines before the body: preview anchors are body-relative, source lines are not. */
  previewLineOffset: number;
};
