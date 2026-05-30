import { NextRequest, NextResponse } from "next/server";
import { handleRestError } from "@/server/rest/error-handler";
import { ConflictError } from "@next-wiki/shared";

/**
 * Route handler for /api/v1/setup/*
 *
 * POST /init   — first-run initialization (idempotent)
 * GET  /status — check whether the wiki has been initialized
 */
export async function handleSetupRoute(req: NextRequest, path: string): Promise<NextResponse> {
  try {
    const subPath = path.replace(/^\/setup/, "");

    // GET /status
    if (subPath === "/status" && req.method === "GET") {
      const { isSetupComplete } = await import("@/server/services/setup/setup-service");
      const initialized = await isSetupComplete();
      return NextResponse.json({ success: true, data: { initialized } });
    }

    // POST /init
    if (subPath === "/init" && req.method === "POST") {
      const { isSetupComplete } = await import("@/server/services/setup/setup-service");
      const { initializeWiki } = await import("@/server/services/setup/init-service");

      // If setup is already complete, a re-init attempt is a conflict.
      // initializeWiki() handles idempotency for in-flight / interrupted runs.
      if (await isSetupComplete()) {
        throw new ConflictError("Wiki is already initialized");
      }

      const body = await req.json();
      const { adminEmail, adminPassword, adminDisplayName, siteName } = body as {
        adminEmail?: string;
        adminPassword?: string;
        adminDisplayName?: string;
        siteName?: string;
      };

      // Basic presence check — detailed validation is done inside initializeWiki()
      if (!adminEmail || !adminPassword || !adminDisplayName) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "adminEmail, adminPassword, and adminDisplayName are required",
            },
          },
          { status: 400 },
        );
      }

      const result = await initializeWiki({ adminEmail, adminPassword, adminDisplayName, siteName });

      return NextResponse.json(
        { success: true, data: result },
        { status: result.alreadyInitialized ? 200 : 201 },
      );
    }

    return NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (err) {
    return handleRestError(err);
  }
}
