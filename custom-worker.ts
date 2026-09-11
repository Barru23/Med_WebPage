// The OpenNext build generates this module before Wrangler bundles the Worker.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- This file is generated only after Next.js finishes type-checking.
import nextHandler from "./.open-next/worker.js";
import { requestScheduledMaintenance } from "./src/lib/maintenanceScheduler";

export default {
  fetch: nextHandler.fetch,

  scheduled(_controller, env, ctx) {
    // A rejected promise is recorded as a failed Cron Event by Cloudflare.
    ctx.waitUntil(requestScheduledMaintenance(env));
  },
} satisfies ExportedHandler<CloudflareEnv>;
