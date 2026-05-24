import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Proxy API calls to FastAPI backend during development
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/:path*`,
      },
    ];
  },

  // WebSocket proxying is handled by the WS client directly
  // pointing to NEXT_PUBLIC_WS_URL
};

export default nextConfig;
