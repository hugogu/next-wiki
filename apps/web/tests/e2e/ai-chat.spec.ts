import { test, expect } from "@playwright/test";

// T046: AI provider and chat E2E journey

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test.describe("AI Providers admin", () => {
  test.beforeEach(async ({ page }) => {
    await page.request.post(`${BASE}/api/auth/sign-in/email`, {
      data: {
        email: process.env.ADMIN_EMAIL ?? "admin@example.com",
        password: process.env.ADMIN_PASSWORD ?? "Password123!",
      },
    });
  });

  test("AI providers page renders without error", async ({ page }) => {
    const resp = await page.goto(`${BASE}/admin/ai`);
    expect(resp?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("AI Providers");
  });

  test("new provider form renders", async ({ page }) => {
    await page.goto(`${BASE}/admin/ai?new=1`);
    await expect(page.locator("form")).toBeVisible();
    await expect(page.locator("select[name=providerType]")).toBeVisible();
  });
});

test.describe("AI REST API", () => {
  test.beforeEach(async ({ page }) => {
    await page.request.post(`${BASE}/api/auth/sign-in/email`, {
      data: {
        email: process.env.ADMIN_EMAIL ?? "admin@example.com",
        password: process.env.ADMIN_PASSWORD ?? "Password123!",
      },
    });
  });

  test("GET /api/v1/ai/providers returns array", async ({ page }) => {
    const resp = await page.request.get(`${BASE}/api/v1/ai/providers`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("Provider CRUD lifecycle", async ({ page }) => {
    // Create
    const created = await page.request.post(`${BASE}/api/v1/ai/providers`, {
      data: {
        key: `e2e-test-${Date.now()}`,
        label: "E2E Test Provider",
        providerType: "ollama",
        endpoint: "http://localhost:11434",
        defaultModel: "llama3",
      },
    });
    expect(created.status()).toBe(201);
    const { data: provider } = await created.json();
    expect(provider.id).toBeTruthy();

    // Get
    const got = await page.request.get(`${BASE}/api/v1/ai/providers/${provider.id}`);
    expect(got.status()).toBe(200);

    // Update
    const updated = await page.request.patch(`${BASE}/api/v1/ai/providers/${provider.id}`, {
      data: { label: "Updated Label" },
    });
    expect(updated.status()).toBe(200);

    // Delete
    const deleted = await page.request.delete(`${BASE}/api/v1/ai/providers/${provider.id}`);
    expect(deleted.status()).toBe(204);
  });

  test("GET /api/v1/ai/conversations returns array for authenticated user", async ({ page }) => {
    const resp = await page.request.get(`${BASE}/api/v1/ai/conversations`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("Conversation CRUD lifecycle", async ({ page }) => {
    // Create conversation
    const created = await page.request.post(`${BASE}/api/v1/ai/conversations`, {
      data: { contextType: "global", title: "E2E Test Conversation" },
    });
    expect(created.status()).toBe(201);
    const { data: conversation } = await created.json();
    expect(conversation.id).toBeTruthy();

    // Get conversation
    const got = await page.request.get(`${BASE}/api/v1/ai/conversations/${conversation.id}`);
    expect(got.status()).toBe(200);

    // List messages (empty initially)
    const msgs = await page.request.get(
      `${BASE}/api/v1/ai/conversations/${conversation.id}/messages`,
    );
    expect(msgs.status()).toBe(200);
    const { data: messages } = await msgs.json();
    expect(Array.isArray(messages)).toBe(true);
    expect(messages.length).toBe(0);

    // Delete conversation
    const deleted = await page.request.delete(
      `${BASE}/api/v1/ai/conversations/${conversation.id}`,
    );
    expect(deleted.status()).toBe(204);
  });
});

test.describe("AI chat stream — no provider configured", () => {
  test.beforeEach(async ({ page }) => {
    await page.request.post(`${BASE}/api/auth/sign-in/email`, {
      data: {
        email: process.env.ADMIN_EMAIL ?? "admin@example.com",
        password: process.env.ADMIN_PASSWORD ?? "Password123!",
      },
    });
  });

  test("stream returns graceful fallback when no provider is active", async ({ page }) => {
    // Create a conversation first
    const convResp = await page.request.post(`${BASE}/api/v1/ai/conversations`, {
      data: { contextType: "global" },
    });
    const { data: conv } = await convResp.json();

    // Hit the stream endpoint
    const streamResp = await page.request.post(`${BASE}/api/ai/stream`, {
      data: { conversationId: conv.id, userMessage: "What is this wiki about?" },
    });
    expect(streamResp.status()).toBe(200);
    const text = await streamResp.text();
    expect(text).toContain("data:");

    // Cleanup
    await page.request.delete(`${BASE}/api/v1/ai/conversations/${conv.id}`);
  });
});

test.describe("MCP endpoint", () => {
  test.beforeEach(async ({ page }) => {
    await page.request.post(`${BASE}/api/auth/sign-in/email`, {
      data: {
        email: process.env.ADMIN_EMAIL ?? "admin@example.com",
        password: process.env.ADMIN_PASSWORD ?? "Password123!",
      },
    });
  });

  test("tools/list returns wiki tools", async ({ page }) => {
    const resp = await page.request.post(`${BASE}/api/mcp`, {
      data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.result?.tools).toBeDefined();
    const names = body.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain("search_wiki");
    expect(names).toContain("get_page");
  });
});
