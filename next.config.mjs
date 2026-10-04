/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['pdf-lib', 'exceljs', 'unpdf'],
  experimental: { serverActions: { bodySizeLimit: '30mb' } },
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'same-origin' },
        { key: 'Cache-Control', value: 'private, no-store' },
      ],
    }];
  },
};
export default nextConfig;
