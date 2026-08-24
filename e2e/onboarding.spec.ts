import { test, expect } from "@playwright/test";

test.describe("Onboarding primeira presença", () => {
  test("wizard aparece na home se não onboarded", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      try {
        const raw = localStorage.getItem("presenca-storage");
        if (!raw) return;
        const data = JSON.parse(raw);
        if (data?.state) data.state.onboarded = false;
        localStorage.setItem("presenca-storage", JSON.stringify(data));
      } catch {
        /* ignore */
      }
    });
    await page.reload();
    await expect(page.getByText(/primeira presença/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/presença mímica/i)).toBeVisible();
    await page.getByRole("button", { name: /continuar/i }).click();
    await expect(page.getByText(/o lar/i).first()).toBeVisible();
  });
});
