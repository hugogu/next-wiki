import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WikiApiClient } from './api-client';
import { createPage, createPageSchema } from './tools/create-page';
import { getPage, getPageSchema } from './tools/get-page';
import { getPageTree, getPageTreeSchema } from './tools/get-page-tree';
import { getRevision, getRevisionSchema } from './tools/get-revision';
import { listPages, listPagesSchema } from './tools/list-pages';
import { listRevisions, listRevisionsSchema } from './tools/list-revisions';
import { publishPage, publishPageSchema } from './tools/publish-page';
import { saveDraft, saveDraftSchema } from './tools/save-draft';
import { searchWiki, searchWikiSchema } from './tools/search-wiki';
import { updatePageProperties, updatePagePropertiesSchema } from './tools/update-properties';
import { uploadImage, uploadImageSchema } from './tools/upload-image';
import { listWikiResources, readWikiResource } from './resources/wiki-page';

export function createWikiMcpServer(client: WikiApiClient): McpServer {
  const server = new McpServer({
    name: 'next-wiki-mcp-server',
    version: '0.1.0',
  });

  server.tool('search_wiki', 'Search wiki pages by keyword.', searchWikiSchema, async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await searchWiki(client, args)) }],
  }));

  server.tool('list_pages', 'List wiki pages visible to the configured API key.', listPagesSchema, async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await listPages(client, args)) }],
  }));

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
