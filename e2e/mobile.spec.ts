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

test.describe("o mundo é tocável no telemóvel", () => {
  /**
   * Regressão de um bug encontrado por teste em aparelho real: a área
   * invisível que roda a câmara ocupa metade do ecrã e vinha depois no DOM
   * com o mesmo z-index dos botões, portanto tapava-os. O joystick, com
   * 120px no canto, tapava o primeiro gesto. Resultado: nenhum botão de
   * interação do mundo respondia ao toque.
   */

  async function entrarNoMundo(page: import("@playwright/test").Page) {
    await page.goto("/world", { waitUntil: "networkidle" });
    await page.waitForSelector("canvas", { timeout: 40_000 });
    await page.getByRole("button", { name: "Entrar" }).tap();
    // A persona mais próxima só aparece depois de o mundo correr uns frames.
    await page.waitForTimeout(3000);
  }

  test("os controlos do mundo não estão tapados por áreas invisíveis", async ({ page }) => {
    await entrarNoMundo(page);

    // Sem isto o teste podia passar em vazio, por não haver botões a
    // verificar — que é precisamente a falsa segurança que ele existe para
    // evitar. A persona só se aproxima depois de o mundo correr uns frames.
    await expect(page.getByRole("button", { name: /Conversar com/i })).toBeVisible({
      timeout: 30_000,
    });

    const tapados = await page.evaluate(() => {
      const alvos = [...document.querySelectorAll("button")].filter((b) => {
        const t = (b.textContent || "").trim();
        return /Conversar com|Toque de mão|Ombro|Abraço|Rosto|Voz/.test(t);
      });
      if (alvos.length < 4) {
        return [`só ${alvos.length} controlo(s) encontrado(s) — o teste não verificou nada`];
      }

      return alvos.flatMap((b) => {
        const r = b.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return [];
        // Vários pontos, não só o centro: a área que tapa cobre metade do
        // ecrã, e o centro de um botão centrado cai exactamente na fronteira
        // — testar só aí deixava o defeito passar.
        const y = r.top + r.height / 2;
        const pontos = [0.1, 0.3, 0.5, 0.7, 0.9].map((f) => r.left + r.width * f);
        return pontos
          .map((x) => {
            const topo = document.elementFromPoint(x, y);
            if (topo && (topo === b || b.contains(topo))) return null;
            return `"${(b.textContent || "").trim()}" tapado em x=${Math.round(x)} por ${topo?.tagName.toLowerCase()}.${String(topo?.className).slice(0, 36)}`;
          })
          .filter(Boolean);
      });
    });

    expect(tapados, "há controlos do mundo que o toque não alcança").toEqual([]);
  });

  test("tocar em 'Conversar' abre mesmo a conversa", async ({ page }) => {
    await entrarNoMundo(page);

    const botao = page.getByRole("button", { name: /Conversar com/i });
    await expect(botao).toBeVisible({ timeout: 20_000 });
    await botao.tap();

    // A conversa abre com o painel e o campo de escrita.
    await expect(page.getByRole("button", { name: "Fechar conversa" })).toBeVisible();
  });
});
