import { NextRequest, NextResponse } from "next/server";
import { handleRestError } from "@/server/rest/error-handler";

// Stub — implemented in Phase 3/4 user story tasks.
export async function handlePagesRoute(_req: NextRequest, _path: string): Promise<NextResponse> {
  return NextResponse.json({ message: "Not yet implemented" }, { status: 501 });
}
export async function handleSearchRoute(_req: NextRequest, _path: string): Promise<NextResponse> {
  return NextResponse.json({ message: "Not yet implemented" }, { status: 501 });
}
export async function handleAssetsRoute(_req: NextRequest, _path: string): Promise<NextResponse> {
  return NextResponse.json({ message: "Not yet implemented" }, { status: 501 });
}
export async function handleAdminRoute(_req: NextRequest, _path: string): Promise<NextResponse> {
  return NextResponse.json({ message: "Not yet implemented" }, { status: 501 });
}
export async function handleAiRoute(_req: NextRequest, _path: string): Promise<NextResponse> {
  return NextResponse.json({ message: "Not yet implemented" }, { status: 501 });
}
