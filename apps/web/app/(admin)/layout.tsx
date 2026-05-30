import { requireAdmin } from "@/server/auth/authorize";
import { ForbiddenError } from "@next-wiki/shared";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-surface">
          <div className="rounded border border-danger-200 bg-white p-8 text-center shadow">
            <h1 className="mb-2 text-xl font-bold text-danger-600">Access Denied</h1>
            <p className="text-text-secondary">Administrator privileges required.</p>
            <a href="/" className="mt-4 inline-block text-sm text-link hover:underline">
              Return to wiki
            </a>
          </div>
        </main>
      );
    }
    throw err; // re-throw redirect from requireAdmin
  }

  return (
    <div className="flex min-h-screen">
      {/* Admin sidebar */}
      <aside className="w-56 shrink-0 border-r border-border bg-surface">
        <div className="p-4">
          <a href="/" className="text-sm font-semibold text-primary-600">
            ← Back to wiki
          </a>
        </div>
        <nav className="px-2 py-4">
          <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Administration
          </p>
          {[
            { href: "/admin", label: "Dashboard" },
            { href: "/admin/users", label: "Users" },
            { href: "/admin/groups", label: "Groups" },
            { href: "/admin/permissions", label: "Permissions" },
            { href: "/admin/auth-providers", label: "Auth Providers" },
            { href: "/admin/themes", label: "Themes" },
            { href: "/admin/ai", label: "AI Providers" },
            { href: "/admin/tags", label: "Tags" },
            { href: "/admin/assets", label: "Assets" },
            { href: "/admin/tasks", label: "Background Tasks" },
          ].map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="flex items-center rounded px-2 py-1.5 text-sm text-text-secondary hover:bg-neutral-100 hover:text-text-primary"
            >
              {label}
            </a>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
