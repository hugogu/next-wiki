import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WikiApiClient } from './api-client';
import { createPage, createPageSchema } from './tools/create-page';
import { deletePage, deletePageSchema } from './tools/delete-page';
import { getBacklinks, getBacklinksSchema } from './tools/get-backlinks';
import { getDiff, getDiffSchema } from './tools/get-diff';
import { getPage, getPageSchema } from './tools/get-page';
import { getPageTree, getPageTreeSchema } from './tools/get-page-tree';
import { getRevision, getRevisionSchema } from './tools/get-revision';
import { getStats, getStatsSchema } from './tools/get-stats';
import { listPages, listPagesSchema } from './tools/list-pages';
import { listRevisions, listRevisionsSchema } from './tools/list-revisions';
import { publishPage, publishPageSchema } from './tools/publish-page';
import { saveDraft, saveDraftSchema } from './tools/save-draft';
import { searchWiki, searchWikiSchema } from './tools/search-wiki';
import { updatePageProperties, updatePagePropertiesSchema } from './tools/update-properties';
import { uploadImage, uploadImageSchema } from './tools/upload-image';
import { batchCreatePages, batchCreatePagesSchema } from './tools/batch-create-pages';
import { findSimilar, findSimilarSchema } from './tools/find-similar';
import { submitSemanticSearch, submitSemanticSearchSchema } from './tools/submit-semantic-search';
import { getSemanticSearchResults, getSemanticSearchResultsSchema } from './tools/get-semantic-search-results';
import { getPageOutboundLinks, getPageOutboundLinksSchema } from './tools/get-page-outbound-links';
import { getNeighborhood, getNeighborhoodSchema } from './tools/get-neighborhood';
import { batchUpdatePages, batchUpdatePagesSchema } from './tools/batch-update-pages';
import { batchSoftDeletePages, batchSoftDeletePagesSchema } from './tools/batch-soft-delete-pages';
import { listWikiResources, readWikiResource } from './resources/wiki-page';
import { listTags, listTagsSchema } from './tools/list-tags';
import { createTag, createTagSchema } from './tools/create-tag';
import { renameTag, renameTagSchema } from './tools/rename-tag';
import { deleteTag, deleteTagSchema } from './tools/delete-tag';
import { mergeTag, mergeTagSchema } from './tools/merge-tag';
import { getTagMutation, getTagMutationSchema } from './tools/get-tag-mutation';
import { updatePageMetadata, updatePageMetadataSchema } from './tools/update-page-metadata';

export function createWikiMcpServer(client: WikiApiClient): McpServer {
  const server = new McpServer({
    name: 'next-wiki-mcp-server',
    version: '0.1.0',
  });

  server.tool(
    'search_wiki',
    'Search wiki pages by keyword. Results include frontmatter; use filterTag for structured page tags and filterStatus/filterOwner/filterHasFrontmatter for frontmatter fields.',
    searchWikiSchema,
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await searchWiki(client, args)) }],
    }),
  );

  server.tool(
    'submit_semantic_search',
    'Submit a natural-language semantic search over the wiki. Returns an action id to poll with get_semantic_search_results. '
      + 'Requires the view and ai.read API-key scopes. Returns 403 if the key lacks either, or 409 (INDEX_NOT_READY) if no '
      + 'embedding index is currently active — normal during initial setup; the agent should retry after the index becomes ready.',
    submitSemanticSearchSchema,
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await submitSemanticSearch(client, args)) }],
    }),
  );

  server.tool(
    'get_semantic_search_results',
    'Poll a semantic search action for status and grounded, cited results.',
    getSemanticSearchResultsSchema,
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await getSemanticSearchResults(client, args)) }],
    }),
  );

  server.tool('list_pages', 'List wiki pages visible to the configured API key.', listPagesSchema, async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await listPages(client, args)) }],
  }));

  server.tool('list_tags', 'List readable active wiki tags.', listTagsSchema, async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await listTags(client, args)) }] }));
  server.tool('create_tag', 'Create a reusable wiki tag. Requires manage_tags.', createTagSchema, async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await createTag(client, args)) }] }));
  server.tool('rename_tag', 'Rename a tag asynchronously. Requires manage_tags.', renameTagSchema, async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await renameTag(client, args)) }] }));
  server.tool('delete_tag', 'Retire a tag asynchronously. Requires manage_tags.', deleteTagSchema, async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await deleteTag(client, args)) }] }));
  server.tool('merge_tag', 'Merge a tag into an existing destination tag asynchronously. Requires manage_tags.', mergeTagSchema, async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await mergeTag(client, args)) }] }));
  server.tool('get_tag_mutation', 'Get the state of a tag rename, deletion, or merge.', getTagMutationSchema, async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await getTagMutation(client, args)) }] }));
  server.tool('update_page_metadata', 'Update page title, date, tags, and summary as a new draft revision.', updatePageMetadataSchema, async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await updatePageMetadata(client, args)) }] }));

  server.tool(
    'get_page_tree',
    'Get the directory tree of wiki pages for a global structural overview. Use ?pathPrefix to scope to a subdirectory.',
    getPageTreeSchema,
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await getPageTree(client, args)) }],
    }),
  );

  server.tool('get_page', 'Get a wiki page by ID, including Markdown source if readable.', getPageSchema, async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await getPage(client, args)) }],
  }));

  server.tool('create_page', 'Create a new wiki page with an initial draft revision.', createPageSchema, async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await createPage(client, args)) }],
  }));

  server.tool('save_draft', 'Save a new draft revision of an existing page.', saveDraftSchema, async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await saveDraft(client, args)) }],
  }));

  server.tool(
    'update_page_properties',
    'Update page title and/or path without changing Markdown content.',
    updatePagePropertiesSchema,
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await updatePageProperties(client, args)) }],
    }),
  );

  server.tool('publish_page', 'Publish a draft revision to make it the current published version.', publishPageSchema, async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await publishPage(client, args)) }],
  }));

  server.tool('list_revisions', 'List revision history of a page.', listRevisionsSchema, async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await listRevisions(client, args)) }],
  }));

  server.tool(
    'get_revision',
    'Get a specific revision including Markdown source if readable.',
    getRevisionSchema,
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await getRevision(client, args)) }],
    }),
  );

  server.tool('upload_image', 'Upload an image and receive a Markdown-ready reference.', uploadImageSchema, async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await uploadImage(client, args)) }],
  }));

  server.tool('delete_page', 'Soft-delete a wiki page, preserving its revision history.', deletePageSchema, async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await deletePage(client, args)) }],
  }));

  server.tool('get_backlinks', 'Find pages that link to a target page.', getBacklinksSchema, async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await getBacklinks(client, args)) }],
  }));

  server.tool(
    'get_page_outbound_links',
    'Get a page\'s outbound links, classified as markdown, wiki ([[wikilink]]), or frontmatter (related_pages), with dangling and external buckets.',
    getPageOutboundLinksSchema,
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await getPageOutboundLinks(client, args)) }],
    }),
  );

  server.tool(
    'get_neighborhood',
    'Get the bounded multi-hop link neighborhood of a page (depth 1-3), following outbound links, inbound links, or both.',
    getNeighborhoodSchema,
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await getNeighborhood(client, args)) }],
    }),
  );

  server.tool('get_diff', 'Get a structured diff between two revisions of a page.', getDiffSchema, async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await getDiff(client, args)) }],
  }));

  server.tool(
    'batch_create_pages',
    'Create up to 50 pages atomically in a single transaction.',
    batchCreatePagesSchema,
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await batchCreatePages(client, args)) }],
    }),
  );

  server.tool(
    'batch_update_pages',
    'Update up to 50 pages (title, path, and/or frontmatter patch) in one request. Each item is atomic on its own but the '
      + 'batch is not transactional across items. Pass dryRun: true to preview without writing.',
    batchUpdatePagesSchema,
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await batchUpdatePages(client, args)) }],
    }),
  );

  server.tool(
    'batch_soft_delete_pages',
    'Soft-delete up to 50 pages in one request. Each item is atomic on its own but the batch is not transactional across '
      + 'items. Pass dryRun: true to preview without deleting.',
    batchSoftDeletePagesSchema,
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await batchSoftDeletePages(client, args)) }],
    }),
  );

  server.tool('get_stats', 'Get aggregate wiki statistics and optional orphan detection.', getStatsSchema, async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await getStats(client, args)) }],
  }));

  server.tool(
    'find_similar',
    'Check for existing pages similar to a proposed title or path.',
    findSimilarSchema,
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await findSimilar(client, args)) }],
    }),
  );

  server.resource(
    'wiki-page',
    'wiki://pages/{id}',
    { description: 'A readable wiki page as Markdown source' },
    async (uri) => ({
      contents: [await readWikiResource(client, uri.toString())],
    }),
  );

  server.resource(
    'wiki-pages',
    'wiki://pages',
    { description: 'List of readable wiki pages' },
    async () => ({
      contents: (await listWikiResources(client)).map((resource) => ({
        ...resource,
        text: '',
      })),
    }),
  );

  return server;
}
