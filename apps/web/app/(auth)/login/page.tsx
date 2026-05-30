import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";

export const metadata = { title: "Sign in — next-wiki" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/");

  const { callbackUrl, error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface">
      <div className="w-full max-w-sm rounded-lg border border-border bg-white p-8 shadow-md">
        <h1 className="mb-6 text-xl font-bold text-text-primary">Sign in to next-wiki</h1>

        {error && (
          <div className="mb-4 rounded border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">
            {error === "CredentialsSignin"
              ? "Invalid email or password."
              : "Authentication failed. Please try again."}
          </div>
        )}

        <LoginForm callbackUrl={callbackUrl} />
      </div>
    </main>
  );
}

function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  return (
    <form action="/api/auth/sign-in/email" method="POST" className="space-y-4">
      {callbackUrl && <input type="hidden" name="callbackURL" value={callbackUrl} />}

      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-text-primary">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded border border-border px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-text-primary">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded border border-border px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
        />
      </div>

      <button
        type="submit"
        className="w-full rounded bg-primary-600 py-2 text-sm font-medium text-white hover:bg-primary-700"
      >
        Sign in
      </button>
    </form>
  );
}
