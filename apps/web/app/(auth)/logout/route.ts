import { NextResponse } from "next/server";
import { auth } from "@/server/auth/index";
import { headers } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /logout — sign the current session out and redirect to login.
export async function GET(): Promise<NextResponse> {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // Session may already be invalid; proceed to redirect regardless.
  }
  return NextResponse.redirect(new URL("/login", process.env.BETTER_AUTH_URL ?? "http://localhost:3000"));
}
