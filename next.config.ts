import type { NextConfig } from 'next';
const config: NextConfig = {
  reactStrictMode: true,
  experimental: { cpus: 2 },
  poweredByHeader: false,
  allowedDevOrigins: ['127.0.0.1'],
};
export default config;
