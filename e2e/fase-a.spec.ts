import { test, expect } from "@playwright/test";
import { abrir } from "./util";

/**
 * Smoke Fase A — família no lar (sem WebGL pesado).
 */
test.describe("Fase A — lugares e checklist scan", () => {
  test("página Lugares mostra checklist de import de scan", async ({ page }) => {
    await abrir(page, "/places");
    await expect(page.getByRole("heading", { name: /lugares/i })).toBeVisible();
    await expect(page.getByText(/import de scan da casa/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/otimizei com meshopt/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /validar e guardar/i })).toBeVisible();
  });

  test("não guarda scan com URL inválida", async ({ page }) => {
    await abrir(page, "/places");
    const urlInput = page.getByPlaceholder("/scans/casa-web.glb");
    await urlInput.fill("nao-e-url");
    // marcar passos obrigatórios clicando nas linhas do checklist
    for (const label of [
      /capturei a casa/i,
      /exportei glb/i,
      /otimizei com meshopt/i,
      /public\/scans/i,
    ]) {
      const row = page.getByText(label).first();
      if (await row.isVisible().catch(() => false)) await row.click();
    }
    await page.getByRole("button", { name: /validar e guardar/i }).click();
    // toast ou mensagem de erro
    await expect(page.getByText(/inválid|URL/i).first()).toBeVisible({ timeout: 8_000 });
  });
});

test.describe("Fase A — mundo e fallback", () => {
  test("rota /world existe e pede entrada ou mostra lar", async ({ page }) => {
    await abrir(page, "/world");
    // ou botão Entrar, ou canvas, ou mensagem de erro controlada
    const entrar = page.getByRole("button", { name: /entrar/i });
    const lar = page.getByText(/lar|presença|mundo|não consegue desenhar/i);
    await expect(entrar.or(lar).first()).toBeVisible({ timeout: 25_000 });
  });
});

test.describe("LiveKit status", () => {
  test("/api/status inclui livekit boolean", async ({ request }) => {
    const res = await request.get("/api/status");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.livekit).toBe("boolean");
  });
});
