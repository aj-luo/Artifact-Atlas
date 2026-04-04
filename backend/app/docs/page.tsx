'use client';

import dynamic from 'next/dynamic';

// Lazy-loaded so swagger-ui-react is not in the initial bundle.
// In production the webpack alias in next.config.ts stubs it out entirely.
const SwaggerUI = dynamic(() => import('swagger-ui-react'), { ssr: false });

export default function DocsPage() {
  return (
    <SwaggerUI
      url="/api/docs"
      docExpansion="list"
      defaultModelsExpandDepth={-1}
    />
  );
}
