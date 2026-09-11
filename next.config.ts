import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't let Next auto-generate/overwrite CLAUDE.md — ours is the hand-written
  // project spec and the source of truth.
  agentRules: false,
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;

// Enable Cloudflare bindings (D1, R2, ...) during `next dev` so local
// development runs against the same runtime as production.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
