import { NextResponse } from "next/server";

// /readyz — readiness check after migrations and startup.
// Returns 200 only when the app is fully initialized and can serve traffic.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    // Lazy import to avoid pulling in DB client at cold-start before migrations.
    const { getDb } = await import("@/server/db/client");
    const db = getDb();
    // Lightweight connectivity probe.
    await db.execute("SELECT 1");

    return NextResponse.json({
      status: "ready",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { status: "not_ready", reason: message, timestamp: new Date().toISOString() },
      { status: 503 },
    );
  }
}
