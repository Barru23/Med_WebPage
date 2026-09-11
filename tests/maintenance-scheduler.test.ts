import { test } from "node:test";
import assert from "node:assert/strict";
import { requestScheduledMaintenance } from "../src/lib/maintenanceScheduler.ts";

const environment = {
  PUBLIC_BASE_URL: "https://xivarri.example/",
  MAINTENANCE_SECRET: "maintenance-test-secret",
};

test("the daily scheduler calls the protected maintenance endpoint", async () => {
  let receivedUrl = "";
  let receivedAuthorization = "";
  const request = async (input: string | URL | Request, init?: RequestInit) => {
    receivedUrl = String(input);
    receivedAuthorization = new Headers(init?.headers).get("authorization") ?? "";
    return new Response('{"ok":true}', { status: 200 });
  };

  await requestScheduledMaintenance(environment, request as typeof fetch);

  assert.equal(receivedUrl, "https://xivarri.example/api/maintenance");
  assert.equal(receivedAuthorization, "Bearer maintenance-test-secret");
});

test("the daily scheduler reports endpoint failures to Cloudflare", async () => {
  const request = async () => new Response("boom", { status: 500 });
  await assert.rejects(
    requestScheduledMaintenance(environment, request as typeof fetch),
    /HTTP 500: boom/,
  );
});
