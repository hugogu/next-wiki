# Consolidate User Menu & User Center Navigator

Date: 2026-06-19
Type: visual refactoring

## Goal

Consolidate scattered header items (UserSettings, Theme, Language, Login/Logout) into
a single UserDropdown. Make User Center pages use the Navigator sidebar for config
tabs (like Admin does), with "User Center" shown in the header bar. Consistent view
style across all pages.

## Current state

Header (right side): UserIcon → ThemeToggle → LanguageSwitcher → Logout/Login

User Center: `<Layout>` wrapper with `<h1>User Center</h1>` + `UserCenterNav`
(horizontal nav tabs) + content. Own sidebar-like nav, duplicated chrome.

## Target state

Header (right side): UserDropdown only (icon opens popover)

UserDropdown contents (signed in):
  Profile      → /user-center/profile
  Preferences  → /user-center/preferences
  API Keys     → /user-center/api-keys
  ──────────
  Theme toggle (inline cycle: auto/light/dark)
  Language     (inline toggle: en/zh)
  ──────────
  Logout

UserDropdown contents (signed out):
  Theme toggle (inline cycle: auto/light/dark)
  Language     (inline toggle: en/zh)
  ──────────
  Login          → /auth/login

Navigator when on /user-center/*: shows user center tabs (Profile, Preferences,
API Keys, Audit Log) instead of page tree.

Header shows "User Center" title when on user-center pages.

## Implementation plan

### 1. New: `UserDropdown.tsx`

- Popover/dropdown triggered by UserIcon button.
- Reuses `ThemeToggle` and `LanguageSwitcher` inline — both are stateless widgets
  that read/write their own contexts, so they work anywhere.
- Signed-in items are Links (Profile, Preferences, API Keys) followed by the
  inline toggles and a logout form.
- Signed-out items are just the toggles and a login link.
- Click-outside closes the dropdown. Escape closes. Focus trap not needed for a
  simple list of menu items.

### 2. Modify: `Header.tsx`

- Remove: ThemeToggle import/usage, LanguageSwitcher import/usage, UserCenter
  IconButton, the separate logout form, the separate login IconButton.
- Add: UserDropdown component at the far right.
- Keep: API Docs, New Page, Admin IconButtons (they stay outside the dropdown).
- Keep: Page action buttons and EditorHeaderActions (unchanged).

### 3. Modify: `Navigator.tsx`

- Add `userCenter` prop (boolean, same pattern as `admin`).
- When `userCenter` is true, render USER_CENTER_ITEMS (reusing the same icons
  and i18n keys from the current `UserCenterNav`).
- USER_CENTER_ITEMS:
  - Profile (/user-center/profile, UserIcon)
  - Preferences (/user-center/preferences, SlidersIcon)
  - API Keys (/user-center/api-keys, KeyIcon)
  - Audit Log (/user-center/audit, ClipboardListIcon)
- Active state based on `currentPath` matching.

### 4. Modify: `user-center/layout.tsx`

- Pass `pageContext={{ path: '/user-center', title: 'User Center', ... }}` to
  `<Layout>` so the header displays the title.
- Remove `<h1>User Center</h1>` and `<UserCenterNav />`.
- Content area becomes full-width inside the main slot.

### 5. Modify: `AppShell.tsx` / `Layout.tsx`

- AppShell passes `userCenter` to Navigator (detected from pageContext or path).
- Layout accepts an optional `userCenter` prop or detects it.

Simpler approach: `user-center/layout.tsx` passes `userCenter` to Layout,
Layout passes it to AppShell, AppShell passes it to Navigator.

### 6. Delete: `UserCenterNav.tsx`

- No longer needed — Navigator handles user center tabs.

### 7. i18n

- No new keys needed. Existing keys for `userCenter.nav.*` are reused in
  Navigator's USER_CENTER_ITEMS.
- UserDropdown labels reuse existing keys: `userCenter.nav.*`,
  `theme.toggleLabel`, language switcher uses its own label,
  `auth.logout.button.submit`, `auth.login.button.submit`.

### 8. Verify

- All user pages still work: /welcome, /new, /edit, /history, /admin/*,
  /api-docs, /user-center/*
- Theme toggle works from dropdown
- Language toggle works from dropdown
- Logout/Login works from dropdown
- Navigator shows page tree on wiki pages, admin nav on admin pages,
  user center nav on user-center pages
- Header shows "User Center" title on user-center pages
