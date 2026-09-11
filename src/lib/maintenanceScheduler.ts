type MaintenanceEnvironment = Pick<CloudflareEnv, "PUBLIC_BASE_URL" | "MAINTENANCE_SECRET">;

/** Invoke the authenticated maintenance route from the Worker's daily Cron Trigger. */
export async function requestScheduledMaintenance(
  env: MaintenanceEnvironment,
  request: typeof fetch = fetch,
): Promise<void> {
  const baseUrl = env.PUBLIC_BASE_URL?.trim();
  const secret = env.MAINTENANCE_SECRET?.trim();
  if (!baseUrl) throw new Error("PUBLIC_BASE_URL is required for scheduled maintenance");
  if (!secret) throw new Error("MAINTENANCE_SECRET is required for scheduled maintenance");

  const url = new URL("/api/maintenance", baseUrl);
  const response = await request(url, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
    redirect: "error",
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(
      `Scheduled maintenance failed with HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
    );
  }
}
