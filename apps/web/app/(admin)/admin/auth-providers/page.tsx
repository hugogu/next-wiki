import { requireAdmin } from "@/server/auth/authorize";
import { listAuthProviders } from "@/server/services/auth/provider-service";

export const metadata = { title: "Auth Providers — Admin" };

const statusColors: Record<string, string> = {
  enabled: "bg-success-100 text-success-700",
  disabled: "bg-neutral-100 text-neutral-600",
  error: "bg-danger-100 text-danger-700",
};

export default async function AdminAuthProvidersPage() {
  const actor = await requireAdmin();
  const providers = await listAuthProviders(actor);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Auth Providers</h1>
        <span className="text-sm text-text-muted">{providers.length} configured</span>
      </div>

      <div className="mb-4 rounded border border-border bg-surface p-4 text-sm text-text-muted">
        <strong>Local email/password</strong> authentication is always enabled. External providers
        (OIDC, LDAP, SAML) listed below are configured via the admin API or environment
        configuration.
      </div>

      {providers.length === 0 ? (
        <p className="text-text-muted">No external auth providers configured.</p>
      ) : (
        <div className="overflow-hidden rounded border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface">
              <tr>
                {["Key", "Type", "Label", "Status", "Created"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {providers.map((p: any) => (
                <tr key={p.id} className="hover:bg-surface">
                  <td className="px-3 py-2 font-mono text-xs">{p.key}</td>
                  <td className="px-3 py-2 uppercase">{p.providerType}</td>
                  <td className="px-3 py-2 font-medium">{p.label}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[p.status] ?? ""}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-text-muted">
                    {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
