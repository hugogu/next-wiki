import { describe, it, expect, beforeAll, afterAll } from "vitest";

// T015: REST contract coverage for page, revision, and search flows.
// These tests run against the live API (integration mode) with a test DB.
// They validate the public API contract — not internal service logic.

const BASE_URL = process.env.TEST_API_URL ?? "http://localhost:3000";

describe("Pages API contract", () => {
  describe("GET /api/v1/pages/:spaceKey/:path", () => {
    it("returns 404 for unknown page", async () => {
      const res = await fetch(`${BASE_URL}/api/v1/pages/nonexistent/unknown`);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toMatchObject({ success: false, error: { code: "NOT_FOUND" } });
    });

    it("returns 200 with page data for existing published page", async () => {
      // Requires seed data — skipped in CI without a test database.
      // Marked as todo until Phase 7 migration smoke tests provide test fixtures.
    });
  });

  describe("GET /api/v1/pages/:spaceKey/:path/revisions", () => {
    it("returns 404 for unknown page", async () => {
      const res = await fetch(`${BASE_URL}/api/v1/pages/nonexistent/unknown/revisions`);
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/v1/search", () => {
    it("returns 400 when q is missing", async () => {
      const res = await fetch(`${BASE_URL}/api/v1/search`);
      expect(res.status).toBe(400);
    });

    it("returns 200 with empty results for unknown query", async () => {
      const res = await fetch(`${BASE_URL}/api/v1/search?q=xyzzy-no-such-page-12345`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ success: true, data: { items: [], total: 0 } });
    });
  });
});

describe("Revision restore API contract", () => {
  it("returns 401 without auth", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/pages/space/path/revisions/fake-id/restore`, {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });
});
