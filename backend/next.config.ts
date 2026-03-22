import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // API-only backend — no need for image optimization
  images: { unoptimized: true },
};

export default nextConfig;
