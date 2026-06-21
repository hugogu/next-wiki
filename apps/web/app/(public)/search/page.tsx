import { Layout } from '@/components/ui/Layout';
import { SemanticSearch } from '@/components/search/SemanticSearch';

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  return <Layout><div className="space-y-md px-lg py-md"><h1 className="font-display text-xl font-semibold">Semantic search</h1><SemanticSearch initialQuery={(await searchParams).q ?? ''} /></div></Layout>;
}
