import { auth } from "@/server/auth/index";
import { toNextJsHandler } from "better-auth/next-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Better Auth handler — covers all /api/auth/* routes.
// This must exist so Next.js doesn't fall through to the [spaceKey] catch-all page route.
const { GET, POST } = toNextJsHandler(auth);

export { GET, POST };
