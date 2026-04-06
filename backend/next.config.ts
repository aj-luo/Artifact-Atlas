import type { NextConfig } from 'next';
import path from 'path';

const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
const root = process.cwd();

const nextConfig: NextConfig = {
  // Point Next.js to the backend subdirectory root in the monorepo
  outputFileTracingRoot: path.join(root, '../'),
  // API-only backend — no need for image optimization
  images: { unoptimized: true },
  // Brotli/gzip compression for all JSON responses
  compress: true,
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin',  value: frontendOrigin },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
        ],
      },
    ];
  },
};

export default nextConfig;
