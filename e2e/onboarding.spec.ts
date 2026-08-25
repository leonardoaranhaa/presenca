import { test, expect } from "@playwright/test";
import { abrir } from "./util";

test.describe("Onboarding primeira presença", () => {
  test("wizard aparece na home se não onboarded", async ({ page }) => {
    await abrir(page, "/");
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
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText(/primeira presença/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/presença mímica/i)).toBeVisible();
    await page.getByRole("button", { name: /continuar/i }).click();
    await expect(page.getByText(/o lar/i).first()).toBeVisible();
  });

  test("o guia não se perde quando se segue o que ele manda fazer", async ({ page }) => {
    await abrir(page, "/");
    await page.evaluate(() => {
      try {
        const raw = localStorage.getItem("presenca-storage");
        if (!raw) return;
        const data = JSON.parse(raw);
        if (data?.state) {
          data.state.onboarded = false;
          data.state.onboardingStep = 0;
        }
        localStorage.setItem("presenca-storage", JSON.stringify(data));
      } catch {
        /* ignore */
      }
    });
    await page.reload({ waitUntil: "domcontentloaded" });

    await expect(page.getByText(/passo 1\/4/i)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /continuar/i }).click();
    await expect(page.getByText(/passo 2\/4/i)).toBeVisible();

    // O próprio passo 2 diz "Ver lugares". Seguir o guia não pode custar o guia.
    await page.getByRole("link", { name: /ver lugares/i }).click();
    await expect(page.getByRole("heading", { name: /lugares/i })).toBeVisible({ timeout: 15_000 });

    await abrir(page, "/");
    await expect(page.getByText(/passo 2\/4/i)).toBeVisible({ timeout: 15_000 });
  });
});
