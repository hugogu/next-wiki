import { test, expect, type Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

async function login(page: Page) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('main').getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL('/');
}

// Mermaid renders each diagram inside a temporary <div id="d{id}"> appended to
// <body>, and removes it once the diagram parses. A half-typed diagram does not
// parse, so unless Mermaid is told to clean up after itself, every preview
// refresh while editing one leaves that div — an error graphic plus a <style>
// block — in the document for the rest of the session.
function leftoverMermaidElements(page: Page) {
  return page.evaluate(
    () =>
      [...document.body.children].filter(
        (element) =>
          element.tagName === 'DIV' && element.id.startsWith('d') && element.querySelector(':scope > svg') !== null,
      ).length,
  );
}

test.describe('editing a Mermaid diagram in the live preview', () => {
  test('leaves no temporary render elements behind when the diagram is invalid', async ({ page }) => {
    test.setTimeout(120_000);
    await login(page);

    const path = `mermaid-preview-${Date.now()}`;
    const created = await page.request.post('/api/v1/pages', {
      data: {
        path,
        title: 'Mermaid preview',
        contentSource: '# Diagram\n\n```mermaid\ngraph TD\n  A --> B\n```\n',
      },
    });
    expect(created.ok()).toBeTruthy();

    const failedRenders: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && message.text().includes('[MermaidBlock] mermaid.render failed')) {
        failedRenders.push(message.text());
      }
    });

    await page.goto(`/edit/${path}`);
    const preview = page.getByTestId('editor-preview-pane');
    await expect(preview.locator('.mermaid svg')).toBeVisible({ timeout: 60_000 });
    expect(await leftoverMermaidElements(page)).toBe(0);

    // Each of these is a syntax error, like the states passed through while typing.
    const brokenStates = [
      'graph TD\n  A -->',
      'graph TD\n  A --> B -->',
      'graph TD\n  A --> B\n  B --',
      'graph TD\n  A --> (',
    ];
    const editor = page.locator('.cm-content');
    for (const [index, source] of brokenStates.entries()) {
      await editor.fill(`# Diagram\n\n\`\`\`mermaid\n${source}\n\`\`\`\n`);
      await expect.poll(() => failedRenders.length, { timeout: 15_000 }).toBe(index + 1);
    }

    expect(await leftoverMermaidElements(page)).toBe(0);
  });
});
