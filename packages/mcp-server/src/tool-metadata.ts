/**
 * MCP-compatible metadata for the built-in `next-wiki` Wiki AI tool provider
 * (026, US6). This mirrors the runtime registry in `apps/web` so an external
 * MCP consumer — or a future external MCP *provider* wired into the runtime —
 * aligns to the same tool vocabulary, categories, and risk classes.
 *
 * The names intentionally match the tools this MCP server registers; the
 * `tools/tools.test.ts` compatibility test guards that alignment. Runtime-only
 * tools without an MCP surface (e.g. tool-evidence capture) are excluded here.
 */

export const BUILTIN_TOOL_PROVIDER_KEY = 'next-wiki';

export type ToolCategory = 'read' | 'page_draft' | 'metadata' | 'tag' | 'batch' | 'raw_evidence';
export type ToolRisk = 'read' | 'draft_write' | 'reviewed_write' | 'immediate_write';

export type BuiltinToolMetadata = {
  name: string;
  category: ToolCategory;
  risk: ToolRisk;
  description: string;
};

export const BUILTIN_TOOL_METADATA: readonly BuiltinToolMetadata[] = [
  { name: 'search_wiki', category: 'read', risk: 'read', description: 'Search wiki pages by keyword or meaning.' },
  { name: 'get_page', category: 'read', risk: 'read', description: 'Read a page including its Markdown source.' },
  { name: 'list_pages', category: 'read', risk: 'read', description: 'List visible pages under a path or space.' },
  { name: 'get_backlinks', category: 'read', risk: 'read', description: 'Find pages linking to a target page.' },
  { name: 'get_neighborhood', category: 'read', risk: 'read', description: 'Read a page with its parent, siblings, and children.' },
  { name: 'list_tags', category: 'tag', risk: 'read', description: 'List reusable wiki tags.' },
  { name: 'create_page', category: 'page_draft', risk: 'draft_write', description: 'Create a new page as a draft revision.' },
  { name: 'save_draft', category: 'page_draft', risk: 'draft_write', description: 'Save a new draft revision of an existing page.' },
  { name: 'update_page_properties', category: 'metadata', risk: 'reviewed_write', description: 'Propose title or path changes for a page.' },
  { name: 'update_page_metadata', category: 'metadata', risk: 'reviewed_write', description: 'Propose date/summary/tag metadata changes for a page.' },
  { name: 'create_tag', category: 'tag', risk: 'reviewed_write', description: 'Create a reusable tag.' },
  { name: 'rename_tag', category: 'tag', risk: 'reviewed_write', description: 'Rename a reusable tag across every page.' },
  { name: 'delete_tag', category: 'tag', risk: 'reviewed_write', description: 'Retire a reusable tag.' },
  { name: 'merge_tag', category: 'tag', risk: 'reviewed_write', description: 'Merge one tag into another across every page.' },
  { name: 'batch_update_pages', category: 'batch', risk: 'reviewed_write', description: 'Propose a coordinated update across several pages.' },
  { name: 'batch_soft_delete_pages', category: 'batch', risk: 'reviewed_write', description: 'Propose soft-deletion of several pages.' },
];

export function listBuiltinToolMetadata(): readonly BuiltinToolMetadata[] {
  return BUILTIN_TOOL_METADATA;
}

export function getBuiltinToolMetadata(name: string): BuiltinToolMetadata | undefined {
  return BUILTIN_TOOL_METADATA.find((tool) => tool.name === name);
}
