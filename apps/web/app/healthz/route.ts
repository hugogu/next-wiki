import { NextResponse } from "next/server";

// /healthz — process-level liveness check.
// Returns 200 if the process is running, regardless of dependency state.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
}
