import { test, expect } from "@playwright/test";
import { abrir } from "./util";

/**
 * Fluxo produto ~10 min: home → onboarding → lugares → criar/círculo → mundo.
 */
test.describe("Produto — primeira presença", () => {
  // Cinco páginas, incluindo o chunk do mundo 3D: num servidor de dev frio a
  // compilação de cada rota sozinha come o orçamento normal de 60s.
  test.slow();

  test("home → guia → lugares → mundo", async ({ page }) => {
    await abrir(page, "/");
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
    await page.reload({ waitUntil: "domcontentloaded" });

    await expect(page.getByText(/primeira presença/i)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /continuar/i }).click();
    await expect(page.getByText(/o lar/i).first()).toBeVisible();

    // ir a lugares pelo link do passo ou navegação
    await abrir(page, "/places");
    await expect(page.getByRole("heading", { name: /lugares/i })).toBeVisible();
    await expect(page.getByText(/import de scan|cômodo por medidas|casa/i).first()).toBeVisible();

    await abrir(page, "/settings");
    await expect(page.getByRole("heading", { name: /configurações/i })).toBeVisible();
    await expect(page.getByText(/experiência|onboarding|guia de 10/i).first()).toBeVisible({
      timeout: 10_000,
    });

    await abrir(page, "/world");
    await expect(
      page
        .getByRole("button", { name: /entrar/i })
        .or(page.getByText(/lar|mundo|presença/i))
        .first(),
    ).toBeVisible({ timeout: 25_000 });
  });
});
