import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// OpenAPI spec is served from the static contract file.
export async function handleOpenApiRoute(_req: NextRequest): Promise<NextResponse> {
  const { readFile } = await import("fs/promises");
  const { join } = await import("path");

  try {
    const specPath = join(process.cwd(), "../../specs/001-wiki-mvp/contracts/public-api.yaml");
    const content = await readFile(specPath, "utf-8");
    return new NextResponse(content, {
      headers: { "Content-Type": "application/yaml" },
    });
  } catch {
    return NextResponse.json({ error: "OpenAPI spec not found" }, { status: 404 });
  }
}
