/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: {
    appIsrStatus: false,
    buildActivity: false,
  },
  serverExternalPackages: ['better-sqlite3'],
  experimental: {
    outputFileTracingIncludes: {
      '/api/**/*': ['./data/**/*'],
    },
  },
};

export default nextConfig;
