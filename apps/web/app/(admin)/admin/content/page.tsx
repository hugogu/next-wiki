import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * 025: the Data Sources editor moved into Bots' General settings so there is
 * one canonical writable location for the AI Conversations toggle (see
 * `BotsTabs`). This route is kept only as a redirect for old bookmarks/links
 * — it must never render a second writable editor (constitution P11).
 */
export default function AdminContentPage() {
  redirect('/admin/bots?tab=general');
}
