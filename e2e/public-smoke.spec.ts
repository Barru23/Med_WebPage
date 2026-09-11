import { expect, test } from "@playwright/test";

test("public home keeps the selected locale and exposes navigation", async ({ page }) => {
  await page.goto("/ca");
  await expect(page).toHaveTitle(/XIVARRI/);
  await expect(page.locator("html")).toHaveAttribute("lang", "ca");
  await expect(page.getByRole("link", { name: /Salta al contingut/i })).toBeAttached();
});

test("admin cannot be read without a valid signed session", async ({ page }) => {
  await page.goto("/admin/activities");
  await expect(page.getByRole("heading", { name: /XIVARRI admin/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Activitats" })).not.toBeVisible();
});
