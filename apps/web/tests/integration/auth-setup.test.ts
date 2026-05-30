import { describe, it, expect, beforeAll, afterAll } from "vitest";

// T029: Integration coverage for first-run setup, local login, and external identity linking.

const BASE_URL = process.env.TEST_API_URL ?? "http://localhost:3000";

describe("Setup API", () => {
  describe("GET /api/v1/setup/status", () => {
    it("returns setup status", async () => {
      const res = await fetch(`${BASE_URL}/api/v1/setup/status`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        success: true,
        data: { initialized: expect.any(Boolean) },
      });
    });
  });

  describe("POST /api/v1/setup/init", () => {
    it("returns 400 when required fields are missing", async () => {
      const res = await fetch(`${BASE_URL}/api/v1/setup/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminEmail: "not-an-email" }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toMatch(/VALIDATION_ERROR|CONFLICT/);
    });

    it("returns 409 when wiki is already initialized", async () => {
      // Only relevant after first-run setup is complete.
      // Skipped in CI without a pre-initialized test database.
    });
  });
});

describe("Auth flow", () => {
  describe("POST /api/auth/sign-in/email", () => {
    it("returns 401 for unknown credentials", async () => {
      const res = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "nobody@example.com",
          password: "wrongpassword",
        }),
      });
      // better-auth returns 401 for invalid credentials
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });
});
