import Link from 'next/link';
import { Layout } from '@/components/ui/Layout';

export const dynamic = 'force-dynamic';

export default function Forbidden() {
  return (
    <Layout>
      <div className="text-center py-xl">
        <h1 className="text-4xl font-semibold mb-sm">403</h1>
        <p className="text-muted mb-md">You do not have permission to view this page.</p>
        <Link href="/" className="text-primary hover:underline">
          Back to wiki home
        </Link>
      </div>
    </Layout>
  );
}
