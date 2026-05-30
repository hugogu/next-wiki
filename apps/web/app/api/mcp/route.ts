import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Optional MCP (Model Context Protocol) transport handler.
// Only active when MCP tools are registered; returns 404 otherwise.
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { handleMcpRequest } = await import("@/server/mcp/tools/wiki-tools");
    return handleMcpRequest(req);
  } catch {
    return NextResponse.json({ error: "MCP endpoint not configured" }, { status: 404 });
  }
}
