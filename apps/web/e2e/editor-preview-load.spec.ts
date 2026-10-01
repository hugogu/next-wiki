import { test, expect, type Page, type Request } from '@playwright/test';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

async function login(page: Page) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('main').getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL('/');
}

// Prose, a code block, a table and math: each section is about 1.2 KB and costs
// the server real CPU to render, so a page of a few dozen sections is slow
// enough that a request per keystroke would outrun it.
function largeMarkdown(sections: number) {
  return Array.from(
    { length: sections },
    (_, i) => `## Section ${i}

Cross-border settlement for corridor ${i} uses **correspondent banks** with a [reference](https://example.com/${i}) and \`inline_code_${i}\`, plus an inline formula $E_${i} = mc^2 + \\sum_{k=1}^{${i}} x_k$.

- first item with \`code\` and a [link](https://example.com/a/${i})
- second item with **bold** text

\`\`\`ts
export function route${i}(amount: number): string {
  const fee = Math.max(0.5, amount * 0.0025);
  return \`direct:\${fee.toFixed(2)}\`;
}
\`\`\`

| corridor | currency | fee |
|---|---|---|
| A-${i} | USD | 0.25% |
| B-${i} | EUR | 0.30% |
| C-${i} | CNY | 0.40% |

$$
\\int_0^{${i}} f(x)\\,dx = F(${i}) - F(0)
$$`,
  ).join('\n\n');
}

test.describe('editor live preview under continuous typing', () => {
  test('keeps one preview request in flight and still shows the final text', async ({ page }) => {
    test.setTimeout(180_000);
    await login(page);

    const path = `preview-load-${Date.now()}`;
    const created = await page.request.post('/api/v1/pages', {
      data: { path, title: 'Preview load', contentSource: largeMarkdown(35) },
    });
    expect(created.ok()).toBeTruthy();

    await page.goto(`/edit/${path}`);
    const preview = page.getByTestId('editor-preview-pane');
    await expect(preview.getByRole('heading', { name: 'Section 34' })).toBeVisible({ timeout: 60_000 });

    // Count only what typing causes, not the initial render above.
    let total = 0;
    let inFlight = 0;
    let maxInFlight = 0;
    const isPreview = (request: Request) => new URL(request.url()).pathname === '/api/preview';
    page.on('request', (request) => {
      if (!isPreview(request)) return;
      total += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
    });
    const settled = (request: Request) => {
      if (isPreview(request)) inFlight -= 1;
    };
    page.on('requestfinished', settled);
    page.on('requestfailed', settled);

    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('\n\n');

    // About 12 characters a second, with no pause long enough to look idle.
    const typed = 'Typing continuously into a large page should never leave the preview behind. FINAL-TYPED-MARKER';
    const startedAt = Date.now();
    await page.keyboard.type(typed, { delay: 80 });
    const typingMs = Date.now() - startedAt;

    await expect(preview.getByText('FINAL-TYPED-MARKER')).toBeVisible({ timeout: 15_000 });

    // A request per keystroke would be ~95 here, all queued behind each other.
    expect(maxInFlight).toBeLessThanOrEqual(1);
    expect(total).toBeLessThanOrEqual(Math.ceil(typingMs / 400) + 3);
  });
});
