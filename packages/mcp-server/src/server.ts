import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getWikiMcpToolDescription as description } from '@next-wiki/shared';
import type { WikiApiClient } from './api-client';
import { createPage, createPageSchema } from './tools/create-page';
import { deletePage, deletePageSchema } from './tools/delete-page';
import { deleteRevision, deleteRevisionSchema } from './tools/delete-revision';
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
import { attachFile, attachFileSchema } from './tools/attach-file';
import { listAttachments, listAttachmentsSchema } from './tools/list-attachments';
import { downloadAttachment, downloadAttachmentSchema } from './tools/download-attachment';
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
import { appendRawEntry, appendRawEntrySchema } from './tools/append-raw-entry';
import { listRawCategories, listRawCategoriesSchema } from './tools/list-raw-categories';
import { createRawCategory, createRawCategorySchema } from './tools/create-raw-category';
import { generateImage, generateImageSchema } from './tools/generate-image';
import { getImageGeneration, getImageGenerationSchema } from './tools/get-image-generation';
import { promoteGeneratedImage, promoteGeneratedImageSchema } from './tools/promote-generated-image';
import { cancelSpaceMigration, cancelSpaceMigrationSchema, getSpaceMigration, getSpaceMigrationSchema, listSpaceMigrationItems, listSpaceMigrationItemsSchema, previewSpaceMigration, previewSpaceMigrationSchema, startSpaceMigration, startSpaceMigrationSchema } from './tools/space-migrations';

export function createWikiMcpServer(client: WikiApiClient): McpServer {
  const server = new McpServer({
    name: 'next-wiki-mcp-server',
    version: '0.1.0',
  });

  server.tool(
    'search_wiki',
    description('search_wiki'),
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

  server.tool('list_pages', description('list_pages'), listPagesSchema, async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await listPages(client, args)) }],
  }));

  server.tool('list_tags', description('list_tags'), listTagsSchema, async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await listTags(client, args)) }] }));
  server.tool('create_tag', description('create_tag'), createTagSchema, async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await createTag(client, args)) }] }));
  server.tool('rename_tag', description('rename_tag'), renameTagSchema, async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await renameTag(client, args)) }] }));
  server.tool('delete_tag', description('delete_tag'), deleteTagSchema, async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await deleteTag(client, args)) }] }));
  server.tool('merge_tag', description('merge_tag'), mergeTagSchema, async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await mergeTag(client, args)) }] }));
  server.tool('get_tag_mutation', 'Get the state of a tag rename, deletion, or merge.', getTagMutationSchema, async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await getTagMutation(client, args)) }] }));
  server.tool('update_page_metadata', description('update_page_metadata'), updatePageMetadataSchema, async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await updatePageMetadata(client, args)) }] }));

  server.tool(
    'get_page_tree',
    'Get the directory tree of visible pages for a content space. Use pathPrefix to scope to a subdirectory.',
    getPageTreeSchema,
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await getPageTree(client, args)) }],
    }),
  );

  server.tool('get_page', description('get_page'), getPageSchema, async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await getPage(client, args)) }],
  }));

  server.tool('create_page', description('create_page'), createPageSchema, async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await createPage(client, args)) }],
  }));

  server.tool('append_raw_entry', 'Append an immutable chunk to a raw entry (extracted text, optional original bytes). Existing raw content cannot be edited or deleted.', appendRawEntrySchema, async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await appendRawEntry(client, args)) }],
  }));

  server.tool('list_raw_categories', 'List the raw taxonomy categories. Use their ids as categoryId when creating raw entries. LLM Wiki mode, Admin-scoped.', listRawCategoriesSchema, async () => ({
    content: [{ type: 'text', text: JSON.stringify(await listRawCategories(client)) }],
  }));

  server.tool('create_raw_category', 'Create a raw taxonomy category. Set isDefault to apply it when a raw entry omits categoryId. LLM Wiki mode, Admin-scoped.', createRawCategorySchema, async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await createRawCategory(client, args)) }],
  }));

  server.tool('save_draft', description('save_draft'), saveDraftSchema, async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await saveDraft(client, args)) }],
  }));

  server.tool(
    'update_page_properties',
    description('update_page_properties'),
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

  server.tool(
    'attach_file',
    'Attach a file (document, video, or image) to a page, separate from images embedded in the page body. Requires the attachments API key scope plus read access to the target page.',
    attachFileSchema,
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await attachFile(client, args)) }],
    }),
  );

  server.tool(
    'list_attachments',
    "List a page's current attachments. Only needs read access to the page — no independent scope.",
    listAttachmentsSchema,
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await listAttachments(client, args)) }],
    }),
  );

  server.tool(
    'download_attachment',
    'Download an attachment by id (base64-encoded bytes). Only needs read access to the attachment\'s page — no independent scope.',
    downloadAttachmentSchema,
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await downloadAttachment(client, args)) }],
    }),
  );

  server.tool(
    'generate_image',
    description('generate_image'),
    generateImageSchema,
    async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await generateImage(client, args)) }] }),
  );

  server.tool(
    'get_image_generation',
    'Poll a private AI image generation request. The response contains safe lifecycle and artifact metadata, never image bytes or provider diagnostics.',
    getImageGenerationSchema,
    async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await getImageGeneration(client, args)) }] }),
  );

  server.tool(
    'promote_generated_image',
    description('promote_generated_image'),
    promoteGeneratedImageSchema,
    async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await promoteGeneratedImage(client, args)) }] }),
  );

  server.tool('preview_space_migration', description('preview_space_migration'), previewSpaceMigrationSchema, async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await previewSpaceMigration(client, args)) }] }));
  server.tool('start_space_migration', description('start_space_migration'), startSpaceMigrationSchema, async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await startSpaceMigration(client, args)) }] }));
  server.tool('get_space_migration', description('get_space_migration'), getSpaceMigrationSchema, async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await getSpaceMigration(client, args)) }] }));
  server.tool('list_space_migration_items', description('list_space_migration_items'), listSpaceMigrationItemsSchema, async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await listSpaceMigrationItems(client, args)) }] }));
  server.tool('cancel_space_migration', description('cancel_space_migration'), cancelSpaceMigrationSchema, async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await cancelSpaceMigration(client, args)) }] }));

  server.tool('delete_page', 'Soft-delete a wiki page, preserving its revision history.', deletePageSchema, async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await deletePage(client, args)) }],
  }));

  server.tool(
    'delete_revision',
    'Soft-delete a historical revision of a page. The currently published and latest revisions cannot be deleted.',
    deleteRevisionSchema,
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await deleteRevision(client, args)) }],
    }),
  );

  server.tool('get_backlinks', description('get_backlinks'), getBacklinksSchema, async (args) => ({
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
    description('get_neighborhood'),
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
    'Create up to 50 pages atomically in a single transaction, with a target content space for each page.',
    batchCreatePagesSchema,
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await batchCreatePages(client, args)) }],
    }),
  );

  server.tool(
    'batch_update_pages',
    description('batch_update_pages'),
    batchUpdatePagesSchema,
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await batchUpdatePages(client, args)) }],
    }),
  );

  server.tool(
    'batch_soft_delete_pages',
    description('batch_soft_delete_pages'),
    batchSoftDeletePagesSchema,
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await batchSoftDeletePages(client, args)) }],
    }),
  );

  server.tool('get_stats', 'Get aggregate statistics and optional orphan detection for a content space.', getStatsSchema, async (args) => ({
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
