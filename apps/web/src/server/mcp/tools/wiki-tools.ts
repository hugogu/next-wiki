import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// MCP tool handler stub — implemented in Phase 6 (T050).
export async function handleMcpRequest(_req: NextRequest): Promise<NextResponse> {
  return NextResponse.json({ error: "MCP not yet configured" }, { status: 404 });
}
