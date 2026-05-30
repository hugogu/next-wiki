import { requireAuth } from "@/server/auth/authorize";

export default async function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // requireAuth redirects to /login if not authenticated
  await requireAuth();

  return <>{children}</>;
}
