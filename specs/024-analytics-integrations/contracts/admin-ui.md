# Admin UI Contract: Web Analytics Integrations

**Feature**: 024-analytics-integrations
**Date**: 2026-07-21

This document describes the admin user interface: the page route, the
form component, the navigation entry, and the i18n keys. The UI follows the
existing `SiteSettingsForm` pattern (`src/components/admin/appearance/SiteSettingsForm.tsx`).

---

## Page Route

**File**: `apps/web/app/(admin)/admin/analytics/page.tsx` (NEW)

**URL**: `/admin/analytics`

**Permission**: `manage_appearance` + `{ kind: 'appearance' }` (admin-only).
Non-admins get `notFound()` (the existing pattern for admin-only pages - see
`admin/appearance/page.tsx`).

**Server component** (RSC):

```tsx
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { AnalyticsProvidersForm } from '@/components/admin/analytics/AnalyticsProvidersForm';
import { getCurrentActor } from '@/server/services/auth';
import { can } from '@/server/permissions';
import { readAnalyticsSettings } from '@/server/services/analytics';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export default async function AdminAnalyticsPage() {
  const actor = await getCurrentActor();
  if (!can({ actor }, 'manage_appearance', { kind: 'appearance' })) notFound();

  const view = await readAnalyticsSettings({ actor });
  const locale = await getLocale();
  const t = getDictionary(locale);

  return (
    <Layout admin>
      <div className="space-y-md px-lg py-md">
        <div>
          <h1 className="font-display text-xl font-semibold">{t('admin.analytics.title')}</h1>
          <p className="mt-xs text-sm text-muted">{t('admin.analytics.description')}</p>
        </div>
        <AnalyticsProvidersForm initial={view} />
      </div>
    </Layout>
  );
}
```

**`dynamic = 'force-dynamic'`**: matches the existing admin pages (admin
pages are never statically cached).

---

## Form Component

**File**: `apps/web/src/components/admin/analytics/AnalyticsProvidersForm.tsx` (NEW)

**Type**: Client component (`'use client'`).

**Props**:

```ts
type Props = {
  initial: AnalyticsSettingsView;
};
```

**Behavior**:
- Renders a list of provider cards, one per registered provider. Each card
  shows:
  - The provider's localized label and description.
  - An enable/disable toggle (Switch component from `ui/`).
  - A Tracking ID text input (Input component from `ui/`).
  - The localized format hint below the input.
  - Inline validation error if the Tracking ID is invalid when enabled.
- A "Save" button at the bottom submits the full provider list to
  `PUT /api/settings/analytics`.
- On success, shows a localized success message (inline, not `alert`).
- On error, shows a localized error message inline.
- The form uses the existing `useTranslation` hook (from `@/i18n/react` or
  equivalent - check the existing `SiteSettingsForm` for the exact import).
- Form state is managed with `useState` (or `useReducer` for the full
  provider list). No global state (Zustand) is needed for this form.

**Submit handler** (sketch):

```tsx
async function handleSave() {
  // Validate locally: every enabled provider must have a non-empty Tracking ID
  // that matches the expected format. Show inline errors if not.
  // ...
  const res = await fetch('/api/settings/analytics', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providers: state.providers }),
  });
  if (res.ok) {
    setStatus('success');
    // Optionally update `initial` with the returned view.
  } else {
    const err = await res.json().catch(() => ({}));
    setStatus('error', err.message ?? t('admin.analytics.saveFailed'));
  }
}
```

**Accessibility**:
- Each input has a `<label>` (the localized Tracking ID label).
- The toggle has an `aria-label` (the localized provider name).
- Error messages are announced via `aria-live="polite"`.

**No browser `alert`**: per the project UI guidance in `AGENTS.md`, all
feedback is shown via inline UI elements.

---

## Navigation Entry

**File**: `apps/web/src/components/layout/Navigator.tsx` (MODIFIED)

Add a new entry to the `operations` group in the admin nav, at the top of the group (before `storage`):

```tsx
{
  label: t('admin.nav.groups.operations'),
  items: [
    { href: '/admin/analytics', label: t('admin.nav.analytics'), icon: <FunctionPlotIcon className="shrink-0" /> }, // NEW
    { href: '/admin/storage', label: t('admin.nav.storage'), icon: <DatabaseIcon className="shrink-0" /> },
    { href: '/admin/transfers', label: t('admin.nav.transfers'), icon: <ArrowUpDownIcon className="shrink-0" /> },
    { href: '/admin/api-audit', label: t('admin.nav.apiAudit'), icon: <... /> },
  ],
},
```

**Icon**: use an existing icon from the icon library already imported in
`Navigator.tsx` (check the imports at the top of the file). A chart/analytics
icon is appropriate; if none exists, use a generic `SlidersIcon` or
`SettingsIcon` variant. Do not introduce a new icon dependency.

---

## i18n Keys

**Files**: `apps/web/messages/en.json` and `apps/web/messages/zh.json` (both
MUST stay in sync).

### New keys (English)

```json
{
  "admin": {
    "nav": {
      "analytics": "Analytics"
    },
    "analytics": {
      "title": "Web analytics",
      "description": "Configure third-party analytics providers. Each provider's tracking script is injected into every page when enabled.",
      "allDisabled": "All analytics providers are currently disabled. No tracking scripts will be loaded.",
      "providers": {
        "baidu_tongji": {
          "label": "Baidu Tongji (百度统计)",
          "description": "Baidu's web analytics service.",
          "trackingId": {
            "label": "Tracking ID",
            "format": "32-character hex string"
          }
        },
        "google_analytics": {
          "label": "Google Analytics",
          "description": "Google's web analytics service (GA4).",
          "trackingId": {
            "label": "Measurement ID",
            "format": "G-XXXXXXXX (e.g. G-A1B2C3D4E5)"
          }
        }
      },
      "save": "Save",
      "saved": "Analytics settings saved.",
      "saveFailed": "Failed to save analytics settings.",
      "invalidTrackingId": "Tracking ID does not match the expected format.",
      "enabledRequiresTrackingId": "Enable requires a valid Tracking ID."
    }
  }
}
```

### New keys (Chinese)

```json
{
  "admin": {
    "nav": {
      "analytics": "统计分析"
    },
    "analytics": {
      "title": "网站统计",
      "description": "配置第三方统计分析服务。每个启用的供应商的跟踪脚本将注入到所有页面中。",
      "allDisabled": "所有统计服务均已关闭，不会加载任何跟踪脚本。",
      "providers": {
        "baidu_tongji": {
          "label": "百度统计",
          "description": "百度提供的网站访问分析服务。",
          "trackingId": {
            "label": "跟踪 ID",
            "format": "32 位十六进制字符串"
          }
        },
        "google_analytics": {
          "label": "Google Analytics",
          "description": "Google 提供的网站访问分析服务（GA4）。",
          "trackingId": {
            "label": "衡量 ID",
            "format": "G-XXXXXXXX（例如 G-A1B2C3D4E5）"
          }
        }
      },
      "save": "保存",
      "saved": "统计设置已保存。",
      "saveFailed": "保存统计设置失败。",
      "invalidTrackingId": "跟踪 ID 格式不正确。",
      "enabledRequiresTrackingId": "启用时需要填写有效的跟踪 ID。"
    }
  }
}
```

**Placement**: inside the existing `admin` object, as a sibling of
`admin.appearance`, `admin.site`, `admin.ai`, etc.

---

## OpenAPI Regeneration

After adding the new `/api/settings/analytics` route with its JSDoc
`@openapi` annotations, run:

```bash
pnpm --filter @next-wiki/web openapi:generate
```

This regenerates `apps/web/openapi.json`. The regenerated file should be
committed alongside the new route.

---

## Non-Goals (out of scope for v1)

- No per-provider preview/test button (e.g. "send a test event"). The vendor
  consoles already provide this.
- No analytics dashboard in the admin UI. The admin configures the provider;
  viewing the collected data happens in the vendor's console.
- No per-user analytics opt-out. The script set is the same for every
  visitor. A visitor-consent / cookie-banner layer would be a separate
  feature.
- No per-route analytics customization. The script is injected on every
  page uniformly.
