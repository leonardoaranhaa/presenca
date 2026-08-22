import { expect, test } from "@playwright/test";

/**
 * O teste que teria apanhado o estado inicial do projeto: não compilava,
 * não arrancava, e as rotas /api/* respondiam 404 em silêncio.
 */

test("a página inicial abre e mostra o lar", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Ninguém se despede/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Entrar no lar/i })).toBeVisible();
});

test("o círculo lista a família de demonstração", async ({ page }) => {
  await page.goto("/circle");
  await expect(page.getByRole("heading", { name: "O círculo" })).toBeVisible();
  await expect(page.getByText("Antônio Oliveira")).toBeVisible();
});

test("a persona memorial abre com cofre e conversa", async ({ page }) => {
  await page.goto("/circle");
  await page.getByText("Antônio Oliveira").click();
  await expect(page.getByRole("heading", { name: "Antônio Oliveira" })).toBeVisible();
  await expect(page.getByPlaceholder(/Falar com/i)).toBeVisible();
});

test("o mundo 3D monta um canvas WebGL", async ({ page }) => {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(e.message));

  await page.goto("/world");

  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible({ timeout: 30_000 });

  // Um canvas com dimensão zero significa que a cena não montou.
  const caixa = await canvas.boundingBox();
  expect(caixa?.width ?? 0).toBeGreaterThan(0);
  expect(caixa?.height ?? 0).toBeGreaterThan(0);

  expect(erros).toEqual([]);
});

test.describe("rotas de API", () => {
  test("/api/turn/credentials devolve iceServers", async ({ request }) => {
    const res = await request.get("/api/turn/credentials");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.iceServers)).toBe(true);
    expect(body.iceServers.length).toBeGreaterThan(0);
  });

  test("/api/turn/credentials recusa outra origem", async ({ request }) => {
    const res = await request.get("/api/turn/credentials", {
      headers: { origin: "https://atacante.example" },
    });
    expect(res.status()).toBe(403);
  });

  test("/api/chat valida o corpo", async ({ request }) => {
    const res = await request.post("/api/chat", { data: { message: "" } });
    expect(res.status()).toBe(400);
  });

  test("/api/chat responde 503 sem chave configurada", async ({ request }) => {
    const res = await request.post("/api/chat", {
      data: { name: "Antônio", systemPrompt: "és mímica", history: [], message: "olá" },
    });
    // 503 sem chave; 200 se o ambiente tiver XAI_API_KEY.
    expect([200, 503]).toContain(res.status());
  });
});
