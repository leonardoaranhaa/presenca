import { expect, test, type Page } from "@playwright/test";
import { abrir, preencher } from "./util";

/**
 * O fluxo que define o produto, percorrido como uma família o faria:
 * trazer uma presença, guardar o que dela se lembra, e voltar noutro dia
 * para encontrar tudo onde ficou.
 */

/**
 * Cria um memorial e fica na página dele — é para lá que o formulário navega.
 *
 * Espera pela hidratação antes de escrever: os campos são inputs controlados,
 * e escrever antes de o React assumir o formulário perde o que se escreveu.
 */
async function criarMemorial(page: Page, nome: string) {
  await abrir(page, "/create");
  await preencher(page, "#name", nome);
  await page.getByRole("button", { name: "Guardar no lar" }).click();
  // A página da persona ganhou painéis pesados (avatar, mapa do cérebro,
  // espaço 3D): renderiza mais devagar do que o timeout de 5s por omissão.
  await expect(page.getByRole("heading", { name: nome })).toBeVisible({ timeout: 25_000 });
}

test("trazer uma presença, guardar uma memória, e encontrá-la depois de recarregar", async ({
  page,
}) => {
  const nome = "Maria das Dores";
  await criarMemorial(page, nome);

  // Guardar uma história no cofre.
  await preencher(page, "#mt", "O bolo de fubá");
  await preencher(page, "#mb", "Fazia todo domingo, sem receita.");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();

  // .first() porque o texto aparece no cartão e no elemento que o contém.
  await expect(page.getByText("O bolo de fubá").first()).toBeVisible({ timeout: 20_000 });

  // O que interessa: continuar lá depois de fechar e voltar.
  await page.reload();
  await expect(page.getByText("O bolo de fubá").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/fazia todo domingo/i).first()).toBeVisible();

  // E aparecer no círculo.
  await abrir(page, "/circle");
  await expect(page.getByText(nome)).toBeVisible();
});

test("o cofre vazio explica-se em vez de ficar em branco", async ({ page }) => {
  await criarMemorial(page, "Alguém Novo");
  await expect(page.getByText(/cofre ainda está vazio/i)).toBeVisible({ timeout: 20_000 });
});

test("retirar uma presença do lar remove-a mesmo, e continua removida", async ({ page }) => {
  const nome = "Presença Temporária";
  await criarMemorial(page, nome);

  await page.getByRole("button", { name: /retirar do lar/i }).click();

  await abrir(page, "/circle");
  await expect(page.getByText(nome)).toHaveCount(0);

  await page.reload();
  await expect(page.getByText(nome)).toHaveCount(0);
});

test("uma presença sem nome não entra no lar", async ({ page }) => {
  await abrir(page, "/create");
  await page.getByRole("button", { name: "Guardar no lar" }).click();
  // Continua no formulário — não navegou para nenhuma persona.
  await expect(page).toHaveURL(/\/create/);
});

test("as memórias de demonstração aparecem no cofre do Antônio", async ({ page }) => {
  await abrir(page, "/circle");
  await page.getByText("Antônio Oliveira").click();
  await expect(page.getByText(/goiabeira/i).first()).toBeVisible();
});

test("um endereço de persona inexistente não dá ecrã branco", async ({ page }) => {
  await abrir(page, "/persona/persona_que_nao_existe");
  await expect(page.getByText(/não está no lar/i)).toBeVisible();
});
