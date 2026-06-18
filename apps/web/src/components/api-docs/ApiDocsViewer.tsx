'use client';

import '@scalar/api-reference-react/style.css';
import nextDynamic from 'next/dynamic';

const ApiReferenceReact = nextDynamic(
  () => import('@scalar/api-reference-react').then((mod) => mod.ApiReferenceReact),
  { ssr: false },
);

export function ApiDocsViewer() {
  return (
    <div className="api-docs-scalar">
      <ApiReferenceReact configuration={{ url: '/api/openapi.json' }} />
    </div>
  );
}
