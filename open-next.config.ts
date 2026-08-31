import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Default OpenNext + Cloudflare configuration. Incremental cache / queue /
// tag cache backends can be wired in later (e.g. R2 or D1) when the app
// starts relying on ISR or on-demand revalidation.
export default defineCloudflareConfig();
