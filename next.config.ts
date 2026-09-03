import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Public pages, admin panel, payments etc. are added in later build steps.

  // Don't let Next auto-generate/overwrite CLAUDE.md — ours is the hand-written
  // project spec and the source of truth.
  agentRules: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;

// Enable Cloudflare bindings (D1, R2, ...) during `next dev` so local
// development runs against the same runtime as production.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
