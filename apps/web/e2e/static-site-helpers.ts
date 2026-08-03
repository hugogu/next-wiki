import { createServer, type Server } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, extname } from 'node:path';
import { promisify } from 'node:util';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

const execFileAsync = promisify(execFile);

export const ADMIN_EMAIL = 'admin@example.com';
export const ADMIN_PASSWORD = 'admin123';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
};

export async function login(page: Page): Promise<void> {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.locator('form').getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('/');
}

export async function createApiKey(page: Page, name: string, scopes: string[]): Promise<string> {
  await page.goto('/user-center/api-keys');
  await page.getByRole('button', { name: 'Create API key' }).first().click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  for (const scope of scopes) {
    await page.getByRole('checkbox', { name: new RegExp(`^${scope}`) }).check();
  }
  await page.locator('form').getByRole('button', { name: 'Create API key' }).click();
  const code = page.locator('code').filter({ hasText: /^nwk_/ });
  await expect(code).toBeVisible();
  const secret = (await code.textContent())?.trim();
  if (!secret) throw new Error('API key secret not found');
  await page.getByRole('button', { name: 'Close' }).click();
  return secret;
}

export async function uploadAsset(
  page: Page,
  key: string,
  name: string,
  buffer: Buffer,
  mimeType: string,
): Promise<{ id: string; markdown: string }> {
  const response = await page.request.post('/api/v1/assets', {
    headers: { Authorization: `Bearer ${key}` },
    multipart: { file: { name, mimeType, buffer } },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string; markdown: string };
}

export async function createPublishedPage(
  page: Page,
  key: string,
  input: { path: string; locale?: string; title: string; contentSource: string },
): Promise<{ id: string; path: string; locale: string; title: string; latestRevision: { id: string } }> {
  const create = await page.request.post('/api/v1/pages?include=latestRevision', {
    headers: { Authorization: `Bearer ${key}` },
    data: { ...input },
  });
  expect(create.status()).toBe(201);
  const created = (await create.json()) as {
    id: string;
    path: string;
    locale: string;
    title: string;
    latestRevision: { id: string };
  };
  const publish = await page.request.post(`/api/v1/pages/${created.id}/revisions/1/publication`, {
    headers: { Authorization: `Bearer ${key}` },
    data: { expectedRevisionId: created.latestRevision.id },
  });
  expect(publish.status()).toBe(200);
  return created;
}

export async function createAndPublishChinesePage(page: Page, key: string): Promise<string> {
  const created = await createPublishedPage(page, key, {
    path: 'chinese-search-demo',
    locale: 'zh',
    title: '中文搜索示例',
    contentSource: '# 中文搜索示例\n\n这是一段用于测试中文搜索功能的示例文本。关键词：北京烤鸭。',
  });
  return created.id;
}

export async function createAndPublishImagePage(page: Page, key: string): Promise<void> {
  const PNG_BUFFER = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const asset = await uploadAsset(page, key, 'pixel.png', PNG_BUFFER, 'image/png');
  await createPublishedPage(page, key, {
    path: 'image-demo',
    title: 'Image Demo',
    contentSource: `# Image Demo\n\n${asset.markdown}`,
  });
}

export async function configureAndPublish(page: Page, gitUrl: string, baseUrl: string): Promise<void> {
  const integration = await page.request.put('/api/integrations', {
    data: {
      kind: 'github',
      authMode: 'https_token',
      username: 'x-access-token',
      secret: 'ghp_test_token',
      label: 'E2E static site',
    },
  });
  expect(integration.status()).toBe(200);

  const target = await page.request.put('/api/static-site/target', {
    data: {
      isEnabled: true,
      provider: 'github_pages',
      remoteUrl: gitUrl,
      branch: 'gh-pages',
      baseUrl,
    },
  });
  expect(target.status()).toBe(202);

  await waitForStaticSiteRun(page);
}

export async function waitForStaticSiteRun(
  page: Page,
  options: { expectedStatus?: 'succeeded' | 'failed' | 'cancelled'; timeout?: number } = {},
): Promise<{ status: string; pagesPublished: number; assetsPublished: number; pagesExcluded: number; errorMessage: string | null }> {
  const { expectedStatus = 'succeeded', timeout = 120_000 } = options;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const response = await page.request.get('/api/static-site/publications?limit=1');
    expect(response.status()).toBe(200);
    const body = (await response.json()) as {
      items: Array<{
        status: string;
        pagesPublished: number;
        assetsPublished: number;
        pagesExcluded: number;
        errorMessage: string | null;
      }>;
    };
    const run = body.items[0];
    if (run) {
      if (run.status === expectedStatus) {
        return run;
      }
      if (run.status === 'failed') {
        throw new Error(`Static site run failed: ${run.errorMessage ?? 'unknown'}`);
      }
      if (run.status === 'cancelled') {
        throw new Error(`Static site run cancelled: ${run.errorMessage ?? 'unknown'}`);
      }
    }
    await page.waitForTimeout(1500);
  }
  throw new Error('Timed out waiting for static site run');
}

export async function takeDownSite(page: Page): Promise<void> {
  await page.goto('/admin/static-site');
  await page.getByRole('button', { name: /Remove public site/i }).click();
  await page.getByRole('textbox').fill('gh-pages');
  await page.getByRole('button', { name: /Remove the site/i }).click();
  await expect(page.getByText('Takedown queued')).toBeVisible();
  await waitForStaticSiteRun(page);
}

export async function cloneBranch(bareRepoPath: string, branch: string, destDir: string): Promise<void> {
  await rm(destDir, { recursive: true, force: true });
  await mkdir(dirname(destDir), { recursive: true });
  await execFileAsync('git', [
    'clone',
    '--branch',
    branch,
    '--single-branch',
    '--depth',
    '1',
    `file://${bareRepoPath}`,
    destDir,
  ]);
}

export type GitServer = { url: string; bareRepoPath: string; close: () => Promise<void> };
export type StaticServer = { url: string; setRoot: (root: string) => void; close: () => Promise<void> };

const REPO_FILE = '/tmp/next-wiki-static-site-repo';

export async function createGitServer(): Promise<GitServer> {
  const tempDir = await mkdtemp(join(tmpdir(), 'next-wiki-static-site-git-'));
  const repoPath = join(tempDir, 'site.git');
  await execFileAsync('git', ['init', '--bare', repoPath]);
  // The `ssh` wrapper on PATH reads this file and redirects git-receive-pack
  // and git-upload-pack to the local bare repository.
  await writeFile(REPO_FILE, repoPath, 'utf8');
  return {
    url: 'ssh://git@127.0.0.1/site.git',
    bareRepoPath: repoPath,
    close: async () => {
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}

export async function createStaticFileServer(): Promise<StaticServer> {
  let root = '';
  const server = createServer(async (req, res) => {
    if (!root) {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('Not ready');
      return;
    }
    let pathname = req.url ?? '/';
    if (pathname.includes('..')) {
      res.writeHead(400);
      res.end();
      return;
    }
    const filePath = join(root, pathname);
    try {
      const s = await stat(filePath);
      if (s.isDirectory()) {
        const indexPath = join(filePath, 'index.html');
        await stat(indexPath);
        const data = await readFile(indexPath);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
        return;
      }
      const ext = extname(filePath);
      const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
      const data = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${address.port}/`,
    setRoot: (r) => {
      root = r;
    },
    close: () =>
      new Promise((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

export async function blockWikiRequests(page: Page, baseURL: string): Promise<void> {
  const pattern = `${new URL(baseURL).origin}/**`;
  await page.route(pattern, (route) => route.abort('blockedbyclient'));
}
