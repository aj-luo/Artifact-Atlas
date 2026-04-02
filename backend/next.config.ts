import type { NextConfig } from 'next';

const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';

const nextConfig: NextConfig = {
  // API-only backend — no need for image optimization
  images: { unoptimized: true },
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
