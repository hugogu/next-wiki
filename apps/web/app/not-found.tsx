import Link from 'next/link';
import { Layout } from '@/components/ui/Layout';

export const dynamic = 'force-dynamic';

export default function NotFound() {
  return (
    <Layout>
      <div className="text-center px-lg py-xl">
        <h1 className="font-display text-5xl font-semibold mb-sm">404</h1>
        <p className="text-muted mb-md">This page does not exist.</p>
        <Link href="/" className="text-primary hover:underline">
          Back to wiki home
        </Link>
      </div>
    </Layout>
  );
}
