import {
  BUILTIN_TOOL_PROVIDER_KEY,
  type AiToolCategory,
  type AiToolDefaultReviewPolicy,
  type AiToolProviderKind,
  type AiToolResultRetention,
  type AiToolRiskLevel,
} from '@next-wiki/shared';
import type { Action } from '@/server/permissions';

/**
 * Static registry of the built-in `next-wiki` tool provider (026, R1/R10).
 *
 * Tool definitions are code registrations, never discovered from the filesystem
 * or network (constitution P10). Names and input/output shapes intentionally
 * follow the packaged MCP server vocabulary so a future external MCP provider
 * can share the same runtime and policy surface. Execution adapters are attached
 * separately by the runtime (US2); this module owns identity and metadata only.
 */

export type ToolDefinition = {
  /** Stable, MCP-compatible tool name. */
  name: string;
  category: AiToolCategory;
  riskLevel: AiToolRiskLevel;
  /** Permission action the initiating user must hold to call the tool. */
  requiredScope: Action;
  resultRetention: AiToolResultRetention;
  defaultReviewPolicy: AiToolDefaultReviewPolicy;
  description: string;
};

export type ProviderDefinition = {
  key: string;
  displayName: string;
  kind: AiToolProviderKind;
};

export const BUILTIN_PROVIDER: ProviderDefinition = {
  key: BUILTIN_TOOL_PROVIDER_KEY,
  displayName: 'next-wiki',
  kind: 'builtin_wiki',
};

const READ_RETENTION: AiToolResultRetention = 'raw_when_durable';

/**
 * The built-in tool catalog. `read`-risk tools resolve to no review regardless
 * of category; mutating tools default to `always_review` and are narrowed only
 * by explicit Admin policy (see ai-tool-policy.ts).
 */
export const BUILTIN_TOOLS: ToolDefinition[] = [
  // --- read ---
  {
    name: 'search_wiki',
    category: 'read',
    riskLevel: 'read',
    requiredScope: 'read',
    resultRetention: READ_RETENTION,
    defaultReviewPolicy: 'allow_immediate',
    description: 'Search wiki pages by keyword or meaning.',
  },
  {
    name: 'get_page',
    category: 'read',
    riskLevel: 'read',
    requiredScope: 'read',
    resultRetention: READ_RETENTION,
    defaultReviewPolicy: 'allow_immediate',
    description: 'Read a page including its Markdown source and revision metadata.',
  },
  {
    name: 'list_pages',
    category: 'read',
    riskLevel: 'read',
    requiredScope: 'read',
    resultRetention: READ_RETENTION,
    defaultReviewPolicy: 'allow_immediate',
    description: 'List visible pages. Args: path or pathPrefix for a subtree, optional space, optional limit.',
  },
  {
    name: 'get_backlinks',
    category: 'read',
    riskLevel: 'read',
    requiredScope: 'read',
    resultRetention: READ_RETENTION,
    defaultReviewPolicy: 'allow_immediate',
    description: 'Find pages linking to a target page.',
  },
  {
    name: 'get_neighborhood',
    category: 'read',
    riskLevel: 'read',
    requiredScope: 'read',
    resultRetention: READ_RETENTION,
    defaultReviewPolicy: 'allow_immediate',
    description: 'Read a page together with its parent, siblings, and children.',
  },
  {
    name: 'list_tags',
    category: 'tag',
    riskLevel: 'read',
    requiredScope: 'read',
    resultRetention: READ_RETENTION,
    defaultReviewPolicy: 'allow_immediate',
    description: 'List reusable wiki tags.',
  },
  // --- page_draft ---
  {
    name: 'create_page',
    category: 'page_draft',
    riskLevel: 'draft_write',
    requiredScope: 'create',
    resultRetention: 'never_full_result',
    defaultReviewPolicy: 'always_review',
    description: 'Create a new page as a draft revision for review. Args: path, title, and either contentSource or contentFromConversation=true.',
  },
  {
    name: 'save_draft',
    category: 'page_draft',
    riskLevel: 'draft_write',
    requiredScope: 'edit',
    resultRetention: 'never_full_result',
    defaultReviewPolicy: 'always_review',
    description: 'Save a new draft revision of an existing page for review. Use contentFromConversation=true to reuse the latest assistant answer.',
  },
  {
    name: 'update_page_metadata',
    category: 'metadata',
    riskLevel: 'reviewed_write',
    requiredScope: 'edit',
    resultRetention: 'never_full_result',
    defaultReviewPolicy: 'always_review',
    description: 'Propose date/summary/tag metadata changes for a page.',
  },
  {
    name: 'update_page_properties',
    category: 'metadata',
    riskLevel: 'reviewed_write',
    requiredScope: 'edit',
    resultRetention: 'never_full_result',
    defaultReviewPolicy: 'always_review',
    description: 'Propose title or path property changes for a page.',
  },
  // --- tag ---
  {
    name: 'create_tag',
    category: 'tag',
    riskLevel: 'reviewed_write',
    requiredScope: 'manage_tags',
    resultRetention: 'never_full_result',
    defaultReviewPolicy: 'always_review',
    description: 'Create a reusable tag.',
  },
  {
    name: 'rename_tag',
    category: 'tag',
    riskLevel: 'reviewed_write',
    requiredScope: 'manage_tags',
    resultRetention: 'never_full_result',
    defaultReviewPolicy: 'always_review',
    description: 'Rename a reusable tag across every page that uses it.',
  },
  {
    name: 'delete_tag',
    category: 'tag',
    riskLevel: 'reviewed_write',
    requiredScope: 'manage_tags',
    resultRetention: 'never_full_result',
    defaultReviewPolicy: 'always_review',
    description: 'Retire a reusable tag.',
  },
  {
    name: 'merge_tag',
    category: 'tag',
    riskLevel: 'reviewed_write',
    requiredScope: 'manage_tags',
    resultRetention: 'never_full_result',
    defaultReviewPolicy: 'always_review',
    description: 'Merge one tag into another across every page.',
  },
  {
    name: 'replace_page_tags',
    category: 'tag',
    riskLevel: 'reviewed_write',
    requiredScope: 'manage_tags',
    resultRetention: 'never_full_result',
    defaultReviewPolicy: 'always_review',
    description: "Replace a page's complete tag set.",
  },
  // --- batch ---
  {
    name: 'batch_update_pages',
    category: 'batch',
    riskLevel: 'reviewed_write',
    requiredScope: 'edit',
    resultRetention: 'never_full_result',
    defaultReviewPolicy: 'always_review',
    description: 'Propose a coordinated update across several pages.',
  },
  {
    name: 'batch_soft_delete_pages',
    category: 'batch',
    riskLevel: 'reviewed_write',
    requiredScope: 'delete',
    resultRetention: 'never_full_result',
    defaultReviewPolicy: 'always_review',
    description: 'Propose soft-deletion of several pages.',
  },
  // --- raw_evidence ---
  {
    name: 'capture_tool_evidence',
    category: 'raw_evidence',
    riskLevel: 'draft_write',
    requiredScope: 'create',
    resultRetention: 'raw_when_durable',
    defaultReviewPolicy: 'policy_review',
    description: 'Capture tool output as a Tool Evidence Raw entry for durable knowledge.',
  },
];

const TOOLS_BY_NAME = new Map(BUILTIN_TOOLS.map((tool) => [tool.name, tool]));

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return TOOLS_BY_NAME.get(name);
}

export function listToolDefinitions(): ToolDefinition[] {
  return BUILTIN_TOOLS;
}

export function listToolsByCategory(category: AiToolCategory): ToolDefinition[] {
  return BUILTIN_TOOLS.filter((tool) => tool.category === category);
}

/** Categories that only ever read; disabling them never blocks a mutation. */
export function isReadOnlyTool(tool: ToolDefinition): boolean {
  return tool.riskLevel === 'read';
}

/** One tool's full contract, tagged with its owning provider. The shape a
 * future external MCP provider must also supply so it reuses the same policy,
 * risk, permission, retention, and review surface (026, US6). */
export type ProviderToolMetadata = ToolDefinition & { providerKey: string; providerKind: ProviderDefinition['kind'] };

export type ProviderMetadata = {
  provider: ProviderDefinition;
  tools: ProviderToolMetadata[];
};

/**
 * Provider-aware metadata for the built-in provider. Every tool carries its
 * provider identity plus the complete category / risk / permission / retention
 * / default-review contract — no field is implicit — so external providers can
 * be described with the same manifest and no tool is ever discovered at runtime
 * (constitution P10).
 */
export function buildBuiltinToolMetadata(): ProviderMetadata {
  return {
    provider: BUILTIN_PROVIDER,
    tools: BUILTIN_TOOLS.map((tool) => ({
      ...tool,
      providerKey: BUILTIN_PROVIDER.key,
      providerKind: BUILTIN_PROVIDER.kind,
    })),
  };
}
