'use client';

import { ApiReferenceReact } from '@scalar/api-reference-react';

export function ApiDocsViewer() {
  return (
    <div className="api-docs-scalar">
      <ApiReferenceReact configuration={{ url: '/api/openapi.json' }} />
    </div>
  );
}
