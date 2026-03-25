import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // API-only backend — no need for image optimization
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin',  value: 'http://localhost:5173' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
        ],
      },
    ];
  },
};

export default nextConfig;
