/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output bundles the server + dependencies into a single
  // portable directory — used by the production Docker image.
  output: "standalone",

  // Proxy all /api/* requests to the Fastify backend.
  // In Docker: BACKEND_URL=http://backend:3001 (internal service name)
  // In local dev: BACKEND_URL=http://localhost:3001
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL ?? "http://localhost:3001";
    return [
      {
        source:      "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },

  // Forward the real client IP through Docker's internal network
  experimental: {},
};

module.exports = nextConfig;
