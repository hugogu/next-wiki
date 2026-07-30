/**
 * Model-visible descriptions for operations exposed by both the public MCP
 * server and the governed in-product Wiki AI runtime.
 *
 * This deliberately describes the operation, not its transport: MCP executes
 * it through an API key and the in-product runtime through a user PermCtx plus
 * review policy. Each adapter may add non-model-facing execution details, but
 * must use this text for the common tool name.
 */
export const wikiMcpToolDescriptions = {
  search_wiki: 'Search readable wiki pages by keyword. Use scope to restrict matching to paths, titles, or content; use space to select a content space.',
  list_pages: 'List readable wiki pages, optionally within a content space.',
  list_tags: 'List readable active wiki tags.',
  create_tag: 'Create a reusable wiki tag.',
  rename_tag: 'Rename a reusable wiki tag.',
  delete_tag: 'Retire a reusable wiki tag.',
  merge_tag: 'Merge one wiki tag into an existing destination tag.',
  update_page_metadata: 'Update page title, date, tags, and summary as a new draft revision.',
  get_page: 'Get a readable wiki page by ID, including its Markdown source.',
  create_page: 'Create a new wiki page with an initial revision.',
  save_draft: 'Save a new draft revision of an existing wiki page.',
  update_page_properties: 'Update page title and/or path without changing Markdown content.',
  generate_image: 'Queue a page-bound AI image generation request.',
  promote_generated_image: 'Promote a generated image into a reusable private Wiki asset without modifying a page.',
  get_backlinks: 'Find pages that link to a target page.',
  get_neighborhood: 'Get the bounded link neighborhood of a page.',
  batch_update_pages: 'Update multiple pages in one request.',
  batch_soft_delete_pages: 'Soft-delete multiple pages in one request.',
} as const;

export type WikiMcpToolName = keyof typeof wikiMcpToolDescriptions;

export function getWikiMcpToolDescription(name: WikiMcpToolName): string {
  return wikiMcpToolDescriptions[name];
}
