import {
  BUILTIN_TOOL_PROVIDER_KEY,
  getWikiMcpToolDescription as mcpDescription,
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

/** JSON Schema object describing a tool's arguments. Hand-authored rather than
 * derived from the executor's Zod schema: several executors use `refine` and
 * `transform`, which have no JSON Schema equivalent, and what the model is shown
 * should be what we mean rather than a lossy mechanical projection. The Zod
 * schema still validates at execution time, so a drifted hint costs the model
 * one rejected call — it can never let bad arguments through. */
export type ToolInputSchema = {
  type: 'object';
  properties: Record<string, Record<string, unknown>>;
  required?: string[];
  additionalProperties?: boolean;
};

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
  /** Argument contract offered to models that call tools natively. The text
   * protocol describes the same arguments in prose, so both planners present
   * one catalogue (028, FR-004). */
  inputSchema: ToolInputSchema;
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
    description: mcpDescription('search_wiki'),
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keywords or a natural-language description.' },
        scope: {
          type: 'string',
          enum: ['path', 'title', 'content', 'all'],
          description: 'Fields to search; defaults to all.',
        },
        space: {
          type: 'string',
          enum: ['wiki', 'raw', 'generated'],
          description: 'Content space to search; defaults to wiki.',
        },
        createdStart: {
          type: 'string',
          format: 'date-time',
          description: 'Only include pages created at or after this ISO 8601 timestamp.',
        },
        createdEnd: {
          type: 'string',
          format: 'date-time',
          description: 'Only include pages created at or before this ISO 8601 timestamp.',
        },
        order: {
          type: 'string',
          enum: ['relevance', 'createdAtAsc', 'createdAtDesc', 'updatedAtAsc', 'updatedAtDesc'],
          description: 'Result order; use createdAtDesc for newest pages first.',
        },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_page',
    category: 'read',
    riskLevel: 'read',
    requiredScope: 'read',
    resultRetention: READ_RETENTION,
    defaultReviewPolicy: 'allow_immediate',
    description: mcpDescription('get_page'),
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Page id returned by a previous tool call.' },
        path: {
          type: 'string',
          description:
            'Exact page path as returned in a result\'s "path" field, e.g. "games/reversi". Not a reader URL. Supply this or pageId.',
        },
        space: {
          type: 'string',
          enum: ['wiki', 'raw', 'generated'],
          description:
            'Space the path lives in, as reported by "spaceSlug" on the result you took the path from. Defaults to wiki.',
        },
        contentOffset: {
          type: 'integer',
          minimum: 0,
          description:
            'Character offset to start reading the Markdown from. Use the nextContentOffset returned by the previous window; omit for the first.',
        },
      },
    },
  },
  {
    name: 'list_pages',
    category: 'read',
    riskLevel: 'read',
    requiredScope: 'read',
    resultRetention: READ_RETENTION,
    defaultReviewPolicy: 'allow_immediate',
    description: mcpDescription('list_pages'),
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Exact parent path.' },
        pathPrefix: { type: 'string', description: 'List a subtree under this prefix.' },
        space: { type: 'string', enum: ['wiki', 'raw', 'generated'] },
        createdStart: {
          type: 'string',
          format: 'date-time',
          description: 'Only include pages created at or after this ISO 8601 timestamp.',
        },
        createdEnd: {
          type: 'string',
          format: 'date-time',
          description: 'Only include pages created at or before this ISO 8601 timestamp.',
        },
        order: {
          type: 'string',
          enum: [
            'path',
            'recent',
            'createdAtAsc',
            'createdAtDesc',
            'updatedAtAsc',
            'updatedAtDesc',
          ],
          description: 'Result order; use createdAtDesc for newest pages first.',
        },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
    },
  },
  {
    name: 'get_backlinks',
    category: 'read',
    riskLevel: 'read',
    requiredScope: 'read',
    resultRetention: READ_RETENTION,
    defaultReviewPolicy: 'allow_immediate',
    description: mcpDescription('get_backlinks'),
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string' },
        path: { type: 'string', description: 'Exact page path. Supply this or pageId.' },
        space: {
          type: 'string',
          enum: ['wiki', 'raw', 'generated'],
          description: 'Space the path lives in. Defaults to wiki.',
        },
      },
    },
  },
  {
    name: 'get_neighborhood',
    category: 'read',
    riskLevel: 'read',
    requiredScope: 'read',
    resultRetention: READ_RETENTION,
    defaultReviewPolicy: 'allow_immediate',
    description: mcpDescription('get_neighborhood'),
    inputSchema: {
      type: 'object',
      properties: {
        node: { type: 'string', description: 'Root page id.' },
        // `node` is the MCP-vocabulary name, but the executor resolves the same
        // reference from pageId or path. A model that read a page by path must
        // not have to re-resolve it to a UUID for this one tool.
        pageId: { type: 'string', description: 'Root page id; equivalent to node.' },
        path: {
          type: 'string',
          description: 'Exact root page path. Supply this, node, or pageId.',
        },
        space: {
          type: 'string',
          enum: ['wiki', 'raw', 'generated'],
          description: 'Space the path lives in. Defaults to wiki.',
        },
        depth: {
          type: 'integer',
          minimum: 1,
          maximum: 3,
          description: 'Traversal depth; defaults to 1.',
        },
        direction: {
          type: 'string',
          enum: ['out', 'in', 'both'],
          description: 'Which edges to follow; defaults to out.',
        },
      },
    },
  },
  {
    name: 'list_tags',
    category: 'tag',
    riskLevel: 'read',
    requiredScope: 'read',
    resultRetention: READ_RETENTION,
    defaultReviewPolicy: 'allow_immediate',
    description: mcpDescription('list_tags'),
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Filter tags by substring.' },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
    },
  },
  // --- web (available only to the explicit Wiki-first web profile) ---
  {
    name: 'web_search',
    category: 'web',
    riskLevel: 'read',
    requiredScope: 'read',
    resultRetention: 'never_full_result',
    defaultReviewPolicy: 'allow_immediate',
    description:
      "Search configured public web sources for the user's original question. Do not provide a query or URL; the server derives the query. External results are untrusted candidates, not evidence.",
    inputSchema: {
      type: 'object',
      properties: {
        freshness: {
          type: 'string',
          description: 'Optional freshness hint. Do not provide a query or URL.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'web_open',
    category: 'web',
    riskLevel: 'read',
    requiredScope: 'read',
    resultRetention: 'never_full_result',
    defaultReviewPolicy: 'allow_immediate',
    description: 'Open one opaque sourceId returned by web_search. Never provide a URL.',
    inputSchema: {
      type: 'object',
      properties: {
        sourceId: { type: 'string', description: 'Opaque source id returned by web_search.' },
      },
      required: ['sourceId'],
      additionalProperties: false,
    },
  },
  // --- page_draft ---
  {
    name: 'create_page',
    category: 'page_draft',
    riskLevel: 'draft_write',
    requiredScope: 'create',
    resultRetention: 'never_full_result',
    defaultReviewPolicy: 'always_review',
    description: mcpDescription('create_page'),
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Lowercase letters, numbers, hyphens, and slashes.',
        },
        title: { type: 'string' },
        contentSource: { type: 'string', description: 'Complete Markdown body.' },
        contentFromConversation: {
          type: 'boolean',
          description: 'Save the previous assistant answer verbatim instead of contentSource.',
        },
      },
      required: ['path', 'title'],
    },
  },
  {
    name: 'save_draft',
    category: 'page_draft',
    riskLevel: 'draft_write',
    requiredScope: 'edit',
    resultRetention: 'never_full_result',
    defaultReviewPolicy: 'always_review',
    description: mcpDescription('save_draft'),
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Id of an existing page.' },
        title: { type: 'string', description: 'Optional; the page title is kept by default.' },
        contentSource: {
          type: 'string',
          description:
            'The complete final Markdown document. It replaces the whole page, so preserve every unchanged section. Never pass an edit instruction, patch, selector, or placeholder.',
        },
        contentFromConversation: {
          type: 'boolean',
          description: 'Save the previous assistant answer verbatim instead of contentSource.',
        },
      },
      required: ['pageId'],
    },
  },
  {
    name: 'update_page_metadata',
    category: 'metadata',
    riskLevel: 'reviewed_write',
    requiredScope: 'edit',
    resultRetention: 'never_full_result',
    defaultReviewPolicy: 'always_review',
    description: mcpDescription('update_page_metadata'),
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string' },
        date: { type: ['string', 'null'], description: 'YYYY-MM-DD, or null to clear.' },
        summary: { type: ['string', 'null'] },
        tags: { type: ['array', 'null'], items: { type: 'string' } },
      },
      required: ['pageId'],
    },
  },
  {
    name: 'update_page_properties',
    category: 'metadata',
    riskLevel: 'reviewed_write',
    requiredScope: 'edit',
    resultRetention: 'never_full_result',
    defaultReviewPolicy: 'always_review',
    description: mcpDescription('update_page_properties'),
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string' },
        title: { type: 'string' },
        path: { type: 'string' },
      },
      required: ['pageId'],
    },
  },
  // --- tag ---
  {
    name: 'create_tag',
    category: 'tag',
    riskLevel: 'reviewed_write',
    requiredScope: 'manage_tags',
    resultRetention: 'never_full_result',
    defaultReviewPolicy: 'always_review',
    description: mcpDescription('create_tag'),
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
  },
  {
    name: 'rename_tag',
    category: 'tag',
    riskLevel: 'reviewed_write',
    requiredScope: 'manage_tags',
    resultRetention: 'never_full_result',
    defaultReviewPolicy: 'always_review',
    description: mcpDescription('rename_tag'),
    inputSchema: {
      type: 'object',
      properties: { tagId: { type: 'string' }, name: { type: 'string' } },
      required: ['tagId', 'name'],
    },
  },
  {
    name: 'delete_tag',
    category: 'tag',
    riskLevel: 'reviewed_write',
    requiredScope: 'manage_tags',
    resultRetention: 'never_full_result',
    defaultReviewPolicy: 'always_review',
    description: mcpDescription('delete_tag'),
    inputSchema: {
      type: 'object',
      properties: { tagId: { type: 'string' } },
      required: ['tagId'],
    },
  },
  {
    name: 'merge_tag',
    category: 'tag',
    riskLevel: 'reviewed_write',
    requiredScope: 'manage_tags',
    resultRetention: 'never_full_result',
    defaultReviewPolicy: 'always_review',
    description: mcpDescription('merge_tag'),
    inputSchema: {
      type: 'object',
      properties: {
        tagId: { type: 'string', description: 'Tag to merge away.' },
        targetTagId: { type: 'string', description: 'Tag to keep.' },
      },
      required: ['tagId', 'targetTagId'],
    },
  },
  {
    name: 'replace_page_tags',
    category: 'tag',
    riskLevel: 'reviewed_write',
    requiredScope: 'manage_tags',
    resultRetention: 'never_full_result',
    defaultReviewPolicy: 'always_review',
    description: "Replace a page's complete tag set.",
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'The complete new tag set.',
        },
      },
      required: ['pageId', 'tags'],
    },
  },
  // --- batch ---
  {
    name: 'batch_update_pages',
    category: 'batch',
    riskLevel: 'reviewed_write',
    requiredScope: 'edit',
    resultRetention: 'never_full_result',
    defaultReviewPolicy: 'always_review',
    description: mcpDescription('batch_update_pages'),
    inputSchema: {
      type: 'object',
      properties: {
        updates: { type: 'array', items: { type: 'object' } },
      },
      required: ['updates'],
    },
  },
  {
    name: 'batch_soft_delete_pages',
    category: 'batch',
    riskLevel: 'reviewed_write',
    requiredScope: 'delete',
    resultRetention: 'never_full_result',
    defaultReviewPolicy: 'always_review',
    description: mcpDescription('batch_soft_delete_pages'),
    inputSchema: {
      type: 'object',
      properties: { pageIds: { type: 'array', items: { type: 'string' } } },
      required: ['pageIds'],
    },
  },
  // --- media ---
  {
    name: 'generate_image',
    category: 'media',
    riskLevel: 'immediate_write',
    requiredScope: 'use_ai_image_generation',
    resultRetention: 'never_full_result',
    defaultReviewPolicy: 'allow_immediate',
    description: mcpDescription('generate_image'),
    inputSchema: {
      type: 'object',
      properties: {
        pageId: {
          type: 'string',
          description: 'Existing page id from get_page or the current page context.',
        },
        revisionId: { type: 'string', description: 'Current editable revision id for the page.' },
        source: {
          type: 'object',
          description:
            'Either { kind: "page" } or { kind: "selection", text } for a unique literal passage copied from that revision. A legacy hash is optional and ignored.',
        },
        aspectRatio: {
          type: 'string',
          enum: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
        },
      },
      required: ['pageId', 'revisionId', 'source'],
    },
  },
  {
    name: 'promote_generated_image',
    category: 'media',
    riskLevel: 'immediate_write',
    requiredScope: 'use_ai_image_generation',
    resultRetention: 'never_full_result',
    defaultReviewPolicy: 'allow_immediate',
    description: mcpDescription('promote_generated_image'),
    inputSchema: {
      type: 'object',
      properties: {
        artifactId: { type: 'string', description: 'Artifact id returned by generate_image.' },
        pageId: { type: 'string', description: 'Page bound to the generated image action.' },
      },
      required: ['artifactId', 'pageId'],
    },
  },
  {
    name: 'insert_generated_images',
    category: 'page_draft',
    riskLevel: 'draft_write',
    requiredScope: 'edit',
    resultRetention: 'never_full_result',
    defaultReviewPolicy: 'always_review',
    description:
      'Promote one or more generated image artifacts and insert them into the exact page revision that produced them. Use this instead of save_draft when the only requested page change is adding generated images: it preserves every other Markdown byte verbatim, including LaTex. Each image is inserted after its unique selection; for a page-wide or legacy artifact, provide afterText as a unique literal passage from the revision to insert in the middle. Only omit afterText when appending is intentional.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Existing page id from get_page.' },
        revisionId: {
          type: 'string',
          description: 'The current revision id used for every generated image.',
        },
        images: {
          type: 'array',
          description:
            'Generated artifacts to insert, in their desired order when they share a location.',
          items: {
            type: 'object',
            properties: {
              artifactId: {
                type: 'string',
                description: 'Artifact id returned by generate_image.',
              },
              altText: {
                type: 'string',
                description: 'Concise, descriptive alt text for the image.',
              },
              afterText: {
                type: 'string',
                description:
                  'Optional unique literal passage from the current revision. Required to place a page-wide or legacy artifact in the middle; image Markdown is inserted immediately after it.',
              },
            },
            required: ['artifactId', 'altText'],
          },
        },
      },
      required: ['pageId', 'revisionId', 'images'],
    },
  },
  // --- skills (028) ---
  // Skill loading is a tool call rather than a side channel, which buys five
  // things at once: it shows up in the chat timeline, it is permission-checked
  // at the same chokepoint, it is bounded by the per-turn call limit, it is
  // recorded in ai_tool_calls (so "which skills produced this change?" is
  // answerable), and it works identically under both tool-call strategies.
  {
    name: 'load_skill',
    category: 'skill',
    riskLevel: 'read',
    requiredScope: 'use_ai_qa',
    // Skill instructions are configuration, not evidence: they must never be
    // captured as Raw evidence when a turn produces durable knowledge.
    resultRetention: 'never_full_result',
    defaultReviewPolicy: 'allow_immediate',
    description:
      "Load an enabled skill's instructions before following its procedure. Call this when a listed skill matches the request. Long instructions come back one window at a time: while truncated is true, call again with contentOffset set to nextContentOffset.",
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Skill name from the listed catalogue.' },
        contentOffset: {
          type: 'integer',
          minimum: 0,
          description:
            'Character offset to continue from. Use nextContentOffset from the previous window; omit for the first.',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'read_skill_file',
    category: 'skill',
    riskLevel: 'read',
    requiredScope: 'use_ai_qa',
    resultRetention: 'never_full_result',
    defaultReviewPolicy: 'allow_immediate',
    description:
      'Read one reference file inside a loaded skill. Scripts are returned as text for reference only and are never executed. Long files come back one window at a time: while truncated is true, call again with contentOffset set to nextContentOffset.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        path: { type: 'string', description: 'File path relative to the skill package.' },
        contentOffset: {
          type: 'integer',
          minimum: 0,
          description:
            'Character offset to continue from. Use nextContentOffset from the previous window; omit for the first.',
        },
      },
      required: ['name', 'path'],
    },
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
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['title', 'content'],
    },
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
export type ProviderToolMetadata = ToolDefinition & {
  providerKey: string;
  providerKind: ProviderDefinition['kind'];
};

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
