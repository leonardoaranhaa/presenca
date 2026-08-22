import { expect, test } from "@playwright/test";

/**
 * O alvo do produto é mobile-first, portanto o telemóvel não é um caso
 * secundário: é o caso.
 *
 * Estes testes fixam duas coisas medidas, não opinadas — que nada transborda
 * na horizontal, e que os alvos de toque respeitam os 44px. A app é para a
 * família toda, incluindo quem já não acerta em alvos de 36px ao primeiro
 * toque.
 */

// Perfil de telemóvel definido à mão em vez de `devices["iPhone SE"]`: esse
// preset traz `defaultBrowserType: "webkit"` e o CI só tem Chromium.
test.use({
  viewport: { width: 375, height: 667 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});

const ROTAS = ["/", "/circle", "/create", "/places", "/persona/persona_antonio"];

for (const rota of ROTAS) {
  test(`${rota} não transborda na horizontal no telemóvel`, async ({ page }) => {
    await page.goto(rota, { waitUntil: "networkidle" });
    const { vw, scrollW } = await page.evaluate(() => ({
      vw: document.documentElement.clientWidth,
      scrollW: document.documentElement.scrollWidth,
    }));
    expect(scrollW, `${rota} deslizava na horizontal`).toBeLessThanOrEqual(vw + 1);
  });
}

for (const rota of ROTAS) {
  test(`${rota} tem alvos de toque de pelo menos 44px`, async ({ page }) => {
    await page.goto(rota, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);

    const pequenos = await page.evaluate(() => {
      // O alvo efetivo de um checkbox é o <label> que o envolve, não o input.
      const efetivo = (e: Element) => e.closest("label") ?? e;
      return [...document.querySelectorAll("button, a, select, textarea, input")]
        .filter((e) => {
          const t = (e as HTMLInputElement).type;
          return t !== "hidden";
        })
        .map((e) => ({ e, r: efetivo(e).getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 44))
        .map(
          ({ e, r }) =>
            `${e.tagName.toLowerCase()}[${(e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 20)}] ${Math.round(r.width)}x${Math.round(r.height)}`,
        );
    });

    expect(pequenos, `${rota} tem alvos pequenos demais para o dedo`).toEqual([]);
  });
}

test("a navegação principal é tocável no telemóvel", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  // Navegar por toque, não por clique de rato, é o gesto real.
  await page.getByRole("link", { name: "Círculo" }).tap();
  await expect(page.getByRole("heading", { name: "O círculo" })).toBeVisible();
});

test("as linhas de consentimento são tocáveis", async ({ page }) => {
  await page.goto("/places", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const abaixo = await page.evaluate(
    () =>
      [...document.querySelectorAll("label")]
        .filter((l) => l.querySelector('input[type="checkbox"]'))
        .filter((l) => l.getBoundingClientRect().height < 44).length,
  );
  expect(abaixo, "há controlos de consentimento difíceis de tocar").toBe(0);
});
