import type { Metadata } from 'next';
import { Layout } from '@/components/ui/Layout';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { CreatePageForm } from '@/components/pages/CreatePageForm';

export const metadata: Metadata = {
  title: 'New page',
};

export default function NewPage() {
  return (
    <Layout>
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'New page' }]} />
      <h1 className="text-2xl font-semibold mb-md">Create a new page</h1>
      <CreatePageForm />
    </Layout>
  );
}
