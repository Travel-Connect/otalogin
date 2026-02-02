/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@otalogin/shared'],
  experimental: {
    serverComponentsExternalPackages: ['googleapis'],
  },
};

module.exports = nextConfig;
