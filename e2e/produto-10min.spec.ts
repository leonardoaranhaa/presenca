import { test, expect } from "@playwright/test";

/**
 * Fluxo produto ~10 min: home → onboarding → lugares → criar/círculo → mundo.
 */
test.describe("Produto — primeira presença", () => {
  test("home → guia → lugares → mundo", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      try {
        const raw = localStorage.getItem("presenca-storage");
        if (raw) {
          const data = JSON.parse(raw);
          if (data?.state) data.state.onboarded = false;
          localStorage.setItem("presenca-storage", JSON.stringify(data));
        }
      } catch {
        /* ignore */
      }
    });
    await page.reload();

    await expect(page.getByText(/primeira presença/i)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /continuar/i }).click();
    await expect(page.getByText(/o lar/i).first()).toBeVisible();

    // ir a lugares pelo link do passo ou navegação
    await page.goto("/places");
    await expect(page.getByRole("heading", { name: /lugares/i })).toBeVisible();
    await expect(page.getByText(/import de scan|cômodo por medidas|casa/i).first()).toBeVisible();

    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: /configurações/i })).toBeVisible();
    await expect(page.getByText(/experiência|onboarding|guia de 10/i).first()).toBeVisible({
      timeout: 10_000,
    });

    await page.goto("/world");
    await expect(
      page
        .getByRole("button", { name: /entrar/i })
        .or(page.getByText(/lar|mundo|presença/i))
        .first(),
    ).toBeVisible({ timeout: 25_000 });
  });
});
