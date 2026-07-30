import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The share card reads these off disk at request time. Without this they get
  // traced away and the route 500s in production with a missing-font error.
  outputFileTracingIncludes: {
    "/api/share-card": ["./src/assets/fonts/**"],
  },
};

export default nextConfig;
