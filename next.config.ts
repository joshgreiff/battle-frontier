import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "play.pokemonshowdown.com"
      },
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com"
      }
    ]
  }
};

export default nextConfig;
