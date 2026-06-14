import Link from 'next/link';
import type { ReactNode } from 'react';
import * as authService from '@/server/services/auth';
import { LogoutButton } from '@/components/auth/LogoutButton';

export async function Layout({ children }: { children: ReactNode }) {
  const actor = await authService.getCurrentActor();
  const isSignedIn = actor.kind === 'user';
  const role = isSignedIn ? actor.role : null;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-surface border-b border-border sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-md py-md flex items-center justify-between">
          <Link href="/" className="text-lg font-semibold text-primary">
            next-wiki
          </Link>
          <nav className="text-sm flex items-center gap-md">
            <Link href="/" className="hover:text-primary transition-colors">
              Pages
            </Link>
            {isSignedIn ? (
              <>
                {role === 'editor' || role === 'admin' ? (
                  <Link href="/new" className="hover:text-primary transition-colors">
                    New page
                  </Link>
                ) : null}
                {role === 'admin' ? (
                  <Link href="/admin/users" className="hover:text-primary transition-colors">
                    Admin
                  </Link>
                ) : null}
                <span className="text-muted">{role}</span>
                <LogoutButton />
              </>
            ) : (
              <>
                <Link href="/auth/login" className="hover:text-primary transition-colors">
                  Sign in
                </Link>
                <Link
                  href="/auth/register"
                  className="text-primary hover:text-primary/80 transition-colors"
                >
                  Register
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-4xl w-full mx-auto px-md py-lg">{children}</main>
      <footer className="border-t border-border py-md text-center text-sm text-muted">
        next-wiki — self-hosted wiki
      </footer>
    </div>
  );
}
