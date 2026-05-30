import { NextResponse } from "next/server";
import { WikiError } from "@next-wiki/shared";
import { ZodError } from "zod";

export function handleRestError(err: unknown): NextResponse {
  if (err instanceof WikiError) {
    return NextResponse.json(
      {
        success: false,
        error: { code: err.code, message: err.message },
      },
      { status: err.statusCode },
    );
  }

  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          fields: err.flatten().fieldErrors,
        },
      },
      { status: 400 },
    );
  }

  const message =
    process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err instanceof Error
        ? err.message
        : String(err);

  console.error("[api] Unhandled error:", err);

  return NextResponse.json(
    { success: false, error: { code: "INTERNAL_ERROR", message } },
    { status: 500 },
  );
}
