# Consolidate User Menu & User Center Navigator — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate scattered header items (UserCenter, Theme, Language, Login/Logout) into one UserDropdown. Make User Center pages use the Navigator sidebar for config tabs, with title in the header bar.

**Architecture:** New `UserDropdown` component replaces 4 individual header items. Navigator gets a `userCenter` mode (like existing `admin` mode) to show user center tabs. Header auto-detects `/user-center/*` path to display title. Delete the now-redundant `UserCenterNav` component.

**Tech Stack:** React 19, Next.js 16, Tailwind CSS, existing i18n keys

---

### Task 1: Add `userCenter` mode to Navigator

**Files:**
- Modify: `apps/web/src/components/layout/Navigator.tsx`

**Step 1: Add USER_CENTER_ITEMS and userCenter prop**

Add after the ADMIN_ITEMS definition (around line 125):

```tsx
const USER_CENTER_ITEMS: AdminNavItem[] = [
  { href: '/user-center/profile', label: t('userCenter.nav.profile'), icon: <UserIcon className="shrink-0" /> },
  { href: '/user-center/preferences', label: t('userCenter.nav.preferences'), icon: <SlidersIcon className="shrink-0" /> },
  { href: '/user-center/api-keys', label: t('userCenter.nav.apiKeys'), icon: <KeyIcon className="shrink-0" /> },
  { href: '/user-center/audit', label: t('userCenter.nav.audit'), icon: <ClipboardListIcon className="shrink-0" /> },
];
```

**Step 2: Update prop interface and destructure**

Add `userCenter` to the destructured props (around line 111):

```tsx
export function Navigator({
  pages,
  admin,
  userCenter,
  currentPath,
  isOpen,
  onClose,
}: {
  pages: PageSummary[];
  admin?: boolean;
  userCenter?: boolean;
  currentPath?: string;
  isOpen: boolean;
  onClose: () => void;
}) {
```

**Step 3: Add userCenter icon imports**

Add `SlidersIcon` and `KeyIcon` to the existing UserIcon import (line 5):

```tsx
import { FileTextIcon, FolderIcon, XIcon, UsersIcon, ClipboardListIcon, UserIcon, SlidersIcon, KeyIcon } from '@/components/icons';
```

**Step 4: Add userCenter branch to rendering**

After the admin nav block (after the `{admin ? (...)` block, around line 165), add a userCenter branch:

```tsx
{userCenter ? (
  <ul className="space-y-xs">
    {USER_CENTER_ITEMS.map((item) => {
      const active = currentPath === item.href;
      return (
        <li key={item.href}>
          <Link
            href={item.href}
            onClick={onClose}
            className={`flex items-center gap-sm px-md py-sm rounded-md text-sm transition-colors ${
              active
                ? 'bg-primary text-primary-text'
                : 'text-muted hover:text-foreground hover:bg-surface-elevated'
            }`}
          >
            {item.icon}
            <span className="truncate">{item.label}</span>
          </Link>
        </li>
      );
    })}
  </ul>
) : pages.length === 0 ? (...)}
```

**Step 5: Update mobile title**

Around line 153, update the title logic for mobile header:

```tsx
<span className="font-display font-semibold text-lg">
  {admin ? t('layout.nav.adminTitle') : userCenter ? t('userCenter.title') : t('layout.nav.pagesTitle')}
</span>
```

**Step 6: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS

**Step 7: Commit**

```bash
git add apps/web/src/components/layout/Navigator.tsx
git commit -m "feat(layout): add userCenter mode to Navigator sidebar"
```

---

### Task 2: Thread `userCenter` prop through AppShell → Layout

**Files:**
- Modify: `apps/web/src/components/layout/AppShell.tsx`
- Modify: `apps/web/src/components/layout/Layout.tsx`

**Step 1: AppShell — add userCenter prop**

Add `userCenter` to the destructured props and pass it to Navigator:

```tsx
export function AppShell({ user, pages, pageContext, admin = false, userCenter = false, children }: AppShellProps) {
```

Then:

```tsx
<Navigator
  pages={pages}
  admin={admin}
  userCenter={userCenter}
  currentPath={pageContext?.path}
  isOpen={navOpen}
  onClose={() => setNavOpen(false)}
/>
```

**Step 2: AppShellProps — add userCenter to types**

In `apps/web/src/components/layout/types.ts`:

```tsx
export type AppShellProps = {
  user: Actor;
  pages: PageSummary[];
  pageContext?: PageContext;
  admin?: boolean;
  userCenter?: boolean;
  children: React.ReactNode;
};
```

**Step 3: Layout — add userCenter prop**

```tsx
export async function Layout({
  children,
  pageContext,
  admin = false,
  userCenter = false,
  skipPasswordGate = false,
}: {
  children: ReactNode;
  pageContext?: PageContext;
  admin?: boolean;
  userCenter?: boolean;
  skipPasswordGate?: boolean;
}) {
```

Then:

```tsx
<AppShell user={actor} pages={pages} pageContext={pageContext} admin={admin} userCenter={userCenter}>
  {children}
</AppShell>
```

**Step 4: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/components/layout/AppShell.tsx apps/web/src/components/layout/Layout.tsx apps/web/src/components/layout/types.ts
git commit -m "feat(layout): thread userCenter prop through AppShell and Layout"
```

---

### Task 3: Create `UserDropdown` component

**Files:**
- Create: `apps/web/src/components/layout/UserDropdown.tsx`
- Modify: `apps/web/src/i18n/locales/en.ts`
- Modify: `apps/web/src/i18n/locales/zh.ts`

**Step 0: Add theme.label and language.label i18n keys**

In `apps/web/src/i18n/locales/en.ts`, after the `theme.toggleLabel` line:
```ts
'theme.label': 'Theme',
'language.label': 'Language',
```

In `apps/web/src/i18n/locales/zh.ts`:
```ts
'theme.label': '主题',
'language.label': '语言',
```

**Step 1: Write the component**

```tsx
'use client';

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Actor } from '@/server/permissions';
import { useTranslation } from '@/i18n/client';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { apiPost } from '@/lib/api/client';
import { UserIcon, LogOutIcon, LogInIcon, KeyIcon, SlidersIcon, ClipboardListIcon } from '@/components/icons';

export function UserDropdown({ user }: { user: Actor }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isSignedIn = user.kind === 'user';

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('userCenter.title')}
        className={`inline-flex items-center justify-center w-9 h-9 rounded-md transition-colors ${
          open ? 'bg-surface-elevated text-foreground' : 'text-muted hover:text-foreground hover:bg-surface-elevated'
        }`}
      >
        <UserIcon />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-surface border border-border rounded-lg shadow-lg py-xs z-50">
          {isSignedIn ? (
            <>
              <DropdownLink href="/user-center/profile" icon={<UserIcon className="w-4 h-4" />} active={pathname === '/user-center/profile'} onClick={() => setOpen(false)}>
                {t('userCenter.nav.profile')}
              </DropdownLink>
              <DropdownLink href="/user-center/preferences" icon={<SlidersIcon className="w-4 h-4" />} active={pathname === '/user-center/preferences'} onClick={() => setOpen(false)}>
                {t('userCenter.nav.preferences')}
              </DropdownLink>
              <DropdownLink href="/user-center/api-keys" icon={<KeyIcon className="w-4 h-4" />} active={pathname === '/user-center/api-keys'} onClick={() => setOpen(false)}>
                {t('userCenter.nav.apiKeys')}
              </DropdownLink>
              <DropdownLink href="/user-center/audit" icon={<ClipboardListIcon className="w-4 h-4" />} active={pathname === '/user-center/audit'} onClick={() => setOpen(false)}>
                {t('userCenter.nav.audit')}
              </DropdownLink>

              <div className="my-xs border-t border-border" />

              <div className="flex items-center justify-between px-md py-sm">
                <span className="text-sm text-muted">{t('theme.label')}</span>
                <ThemeToggle />
              </div>
              <div className="flex items-center justify-between px-md py-sm">
                <span className="text-sm text-muted">{t('language.label')}</span>
                <LanguageSwitcher />
              </div>

              <div className="my-xs border-t border-border" />

              <form
                action="/api/auth/logout"
                method="POST"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await apiPost('/api/auth/logout', {});
                  window.location.href = '/';
                }}
              >
                <button
                  type="submit"
                  className="flex items-center w-full gap-sm px-md py-sm text-sm text-left text-muted hover:text-foreground hover:bg-surface-elevated transition-colors rounded-md"
                >
                  <LogOutIcon className="w-4 h-4" />
                  <span>{t('auth.logout.button.submit')}</span>
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between px-md py-sm">
                <span className="text-sm text-muted">{t('theme.label')}</span>
                <ThemeToggle />
              </div>
              <div className="flex items-center justify-between px-md py-sm">
                <span className="text-sm text-muted">Language</span>
                <LanguageSwitcher />
              </div>

              <div className="my-xs border-t border-border" />

              <Link
                href="/auth/login"
                onClick={() => setOpen(false)}
                className="flex items-center gap-sm px-md py-sm text-sm text-muted hover:text-foreground hover:bg-surface-elevated transition-colors rounded-md"
              >
                <LogInIcon className="w-4 h-4" />
                <span>{t('auth.login.button.submit')}</span>
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DropdownLink({
  href,
  icon,
  active,
  children,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-sm px-md py-sm text-sm transition-colors rounded-md ${
        active
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-muted hover:text-foreground hover:bg-surface-elevated'
      }`}
    >
      {icon}
      <span>{children}</span>
    </Link>
  );
}
```

**Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/components/layout/UserDropdown.tsx apps/web/src/i18n/locales/en.ts apps/web/src/i18n/locales/zh.ts
git commit -m "feat(layout): add UserDropdown consolidating user menu items"
```

---

### Task 4: Wire UserDropdown into Header, remove scattered items

**Files:**
- Modify: `apps/web/src/components/layout/Header.tsx`

**Step 1: Modify Header.tsx**

Remove these imports:
```tsx
// REMOVE:
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { ... UserIcon } from '@/components/icons';
```

Add import:
```tsx
import { UserDropdown } from './UserDropdown';
```

Keep in icons import: `UserIcon` can be removed from Header. The other icons stay.

Also add `usePathname`:
```tsx
import { usePathname } from 'next/navigation';
```

**Step 2: Replace scattered items with UserDropdown**

In the right-side div, where it currently has:
```tsx
{isSignedIn && (
  <>
    <IconButton href="/api-docs" label={t('layout.header.apiDocs')}>
      <CodeIcon />
    </IconButton>
    <IconButton href="/user-center" label={t('userCenter.title')}>
      <UserIcon />
    </IconButton>
  </>
)}
...
{isSignedIn ? (<form>Logout</form>) : (<IconButton href="/auth/login">Login</IconButton>)}
<ThemeToggle />
<LanguageSwitcher />
```

Replace with:
```tsx
<UserDropdown user={user} />
```

The API Docs link (`CodeIcon`) stays — it's an app-level feature, not user-specific:
```tsx
<IconButton href="/api-docs" label={t('layout.header.apiDocs')}>
  <CodeIcon />
</IconButton>
```

**Step 3: Add user-center title auto-detection**

In the Header component, before the `title` const (around line 123):

```tsx
const pathname = usePathname();
```

Then modify the title logic:
```tsx
const isOnUserCenter = pathname.startsWith('/user-center');
const title = editor
  ? editor.title.trim() || editor.defaultTitle
  : isOnUserCenter
    ? t('userCenter.title')
    : pageContext?.title ?? null;
```

**Step 4: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/components/layout/Header.tsx
git commit -m "refactor(layout): replace scattered header items with UserDropdown"
```

---

### Task 5: Update user-center layout to use Navigator sidebar

**Files:**
- Modify: `apps/web/app/(user)/user-center/layout.tsx`

**Step 1: Rewrite the layout**

Replace the entire layout with:

```tsx
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Layout } from '@/components/ui/Layout';
import { getCurrentActor } from '@/server/services/auth';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return { title: t('userCenter.metadataTitle') };
}

export default async function UserCenterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await getCurrentActor();
  if (actor.kind === 'anonymous') {
    redirect('/auth/login');
  }

  return (
    <Layout userCenter>
      <div className="max-w-4xl mx-auto px-lg py-xl">
        <div className="min-w-0">{children}</div>
      </div>
    </Layout>
  );
}
```

Key changes:
- Remove import of `UserCenterNav` (it will be deleted in Task 6)
- Pass `userCenter` to `<Layout userCenter>` — this triggers Navigator's user-center mode
- Remove `<h1>User Center</h1>` — header shows it via path detection
- Remove `<UserCenterNav />` — Navigator handles it
- Content area simplified (no more flex row with nav)

**Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/app/\(user\)/user-center/layout.tsx
git commit -m "refactor(user-center): use Navigator sidebar, remove inline nav and h1"
```

---

### Task 6: Delete `UserCenterNav` component

**Files:**
- Delete: `apps/web/src/components/user-center/UserCenterNav.tsx`

**Step 1: Verify no remaining imports**

```bash
grep -r "UserCenterNav" apps/web/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"
```

Expected: No output (or only the UserCenterNav.tsx file itself)

**Step 2: Delete the file**

```bash
rm apps/web/src/components/user-center/UserCenterNav.tsx
```

**Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS

**Step 4: Commit**

```bash
git rm apps/web/src/components/user-center/UserCenterNav.tsx
git commit -m "refactor(user-center): delete UserCenterNav, superseded by Navigator"
```

---

### Task 7: Final verification

**Step 1: Full typecheck**

```bash
pnpm typecheck
```

Expected: PASS

**Step 2: Full lint**

```bash
pnpm lint
```

Expected: PASS with 0 warnings

**Step 3: Full test suite**

```bash
pnpm test
```

Expected: All 83 tests pass

**Step 4: Visual check (dev server)**

```bash
docker compose up -d --build
# Or: cd apps/web && pnpm dev
```

Navigate to:
- `/` — header shows brand, no title, user dropdown works
- `/welcome` — page actions + user dropdown
- `/user-center/profile` — sidebar shows user center tabs, header shows "User Center"
- `/admin/users` — sidebar shows admin nav, ShieldIcon in header
- `/new` — editor header, user dropdown
- `/auth/login` — login page shows login link in dropdown

**Step 5: Commit any remaining cleanup**

```bash
git add -A
git commit -m "chore: final cleanup after user menu consolidation"
```
