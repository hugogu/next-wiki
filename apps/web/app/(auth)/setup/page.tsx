import { redirect } from "next/navigation";
import { isSetupComplete } from "@/server/services/setup/setup-service";

// First-run setup page. Redirects to home if setup is already complete.
export default async function SetupPage() {
  const complete = await isSetupComplete();
  if (complete) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface">
      <div className="w-full max-w-md rounded-lg border border-border bg-white p-8 shadow-md">
        <h1 className="mb-2 text-2xl font-bold text-text-primary">Welcome to next-wiki</h1>
        <p className="mb-6 text-text-secondary">
          Complete first-run setup to create the initial administrator account.
        </p>
        {/* SetupForm is implemented in Phase 4 (T031) */}
        <div className="rounded-md bg-surface p-4 text-sm text-text-muted">
          Setup form — implemented in Phase 4 (T031)
        </div>
      </div>
    </main>
  );
}
