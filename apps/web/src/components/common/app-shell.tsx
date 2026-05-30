import type { ReactNode } from "react";
import { getSession } from "@/server/auth/session";

interface AppShellProps {
  children: ReactNode;
  /** Optional breadcrumb or title for the page header area. */
  header?: ReactNode;
}

/**
 * Common chrome wrapper for public and editor surfaces.
 * Provides a top navigation bar with wiki branding, search, and user state.
 * All token-based classes here ensure theme changes propagate consistently.
 */
export async function AppShell({ children, header }: AppShellProps) {
  const session = await getSession();
  const user = session?.user;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top navigation */}
      <header className="sticky top-0 z-10 border-b border-border bg-surface shadow-sm">
        <div className="mx-auto flex h-14 max-w-screen-xl items-center gap-4 px-4">
          {/* Branding */}
          <a href="/" className="flex items-center gap-2 font-semibold text-text-primary hover:text-primary-600">
            <span className="text-lg">📖</span>
            <span className="hidden sm:inline">next-wiki</span>
          </a>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Search */}
          <a
            href="/search"
            className="flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-text-muted hover:border-primary-300 hover:text-text-primary"
          >
            <span>🔍</span>
            <span className="hidden md:inline">Search…</span>
          </a>

          {/* User / auth */}
          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-text-secondary">{user.name}</span>
              <a
                href="/admin"
                className="rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-neutral-100 hover:text-text-primary"
              >
                Admin
              </a>
              <a
                href="/api/auth/sign-out"
                className="rounded-md px-3 py-1.5 text-sm text-text-muted hover:bg-neutral-100"
              >
                Sign out
              </a>
            </div>
          ) : (
            <a
              href="/login"
              className="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
            >
              Sign in
            </a>
          )}
        </div>

        {/* Optional page header / breadcrumb area */}
        {header && (
          <div className="border-t border-border bg-background px-4 py-2 text-sm text-text-secondary">
            {header}
          </div>
        )}
      </header>

      {/* Page content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-border bg-surface py-4 text-center text-xs text-text-muted">
        Powered by next-wiki
      </footer>
    </div>
  );
}
