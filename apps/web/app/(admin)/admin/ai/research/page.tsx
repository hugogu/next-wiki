import { redirect } from 'next/navigation';

/** Keep a stable, shareable admin address while rendering the one canonical
 * Web Research panel inside the existing AI settings surface. */
export default function AdminAiResearchPage() {
  redirect('/admin/ai?tab=research');
}
