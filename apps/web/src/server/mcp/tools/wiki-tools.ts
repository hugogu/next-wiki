import { NextRequest, NextResponse } from "next/server";
import { getSession, buildPermissionContext } from "@/server/auth/session";

type McpRequest = {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
};

type McpResponse = {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string };
};

const TOOLS = [
  {
    name: "search_wiki",
    description: "Search the wiki for pages matching a keyword query",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keywords to search for" },
        limit: { type: "number", description: "Max results (default 5)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_page",
    description: "Get the content of a specific wiki page by its path",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Page path slug" },
      },
      required: ["path"],
    },
  },
];

async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (name === "search_wiki") {
    const query = String(args.query ?? "");
    const limit = Number(args.limit ?? 5);
    const { handleSearchRoute } = await import("@/server/rest/routes/search");
    const fakeReq = new Request(
      `http://localhost/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    ) as NextRequest;
    const resp = await handleSearchRoute(fakeReq, `/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    return resp.json();
  }

  if (name === "get_page") {
    const { getDb } = await import("@/server/db/client");
    const { pages, pageRevisions } = await import("@/server/db/schema/wiki");
    const { eq, desc } = await import("drizzle-orm");

    const pathVal = String(args.path ?? "");
    const db = getDb();
    const [page] = await db.select().from(pages).where(eq(pages.path, pathVal)).limit(1);
    if (!page) return { error: "Page not found" };

    const [revision] = await db
      .select()
      .from(pageRevisions)
      .where(eq(pageRevisions.pageId, page.id))
      .orderBy(desc(pageRevisions.createdAt))
      .limit(1);

    return {
      id: page.id,
      path: page.path,
      title: page.title,
      content: revision?.sourceMarkdown ?? "",
    };
  }

  return { error: `Unknown tool: ${name}` };
}

export async function handleMcpRequest(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await buildPermissionContext(session.user.id);

  const body = (await req.json()) as McpRequest;

  if (body.method === "tools/list") {
    return NextResponse.json({
      jsonrpc: "2.0",
      id: body.id,
      result: { tools: TOOLS },
    } satisfies McpResponse);
  }

  if (body.method === "tools/call") {
    const { name, arguments: args } = (body.params ?? {}) as {
      name: string;
      arguments: Record<string, unknown>;
    };
    try {
      const result = await handleToolCall(name, args ?? {});
      return NextResponse.json({
        jsonrpc: "2.0",
        id: body.id,
        result: { content: [{ type: "text", text: JSON.stringify(result) }] },
      } satisfies McpResponse);
    } catch (err) {
      return NextResponse.json({
        jsonrpc: "2.0",
        id: body.id,
        error: { code: -32000, message: err instanceof Error ? err.message : "Tool call failed" },
      } satisfies McpResponse);
    }
  }

  return NextResponse.json({
    jsonrpc: "2.0",
    id: body.id ?? null,
    error: { code: -32601, message: "Method not found" },
  } satisfies McpResponse);
}
