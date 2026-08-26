import { expect, type Page } from "@playwright/test";

/**
 * Abre uma rota sem esperar por recursos externos.
 *
 * Nem `networkidle` nem `load` servem aqui: a app carrega tipos de letra do
 * Google Fonts e o `<Text>` do drei vai buscar dados de fontes ao jsdelivr em
 * tempo de execução. Se qualquer um demorar — ou for inalcançável, como numa
 * rede restrita — nenhum dos dois dispara, e o teste falha por um motivo que
 * nada tem a ver com o que está a verificar.
 *
 * `domcontentloaded` não espera por eles. Quem chama espera depois pelo
 * elemento que lhe interessa.
 */
export async function abrir(page: Page, rota: string) {
  await page.goto(rota, { waitUntil: "domcontentloaded" });
  // `data-hidratado` aparece quando o store rehidrata e os formulários passam
  // a responder — ver o comentário em `shell.tsx`. Nem todas as páginas usam o
  // Shell (o mundo 3D e o 404 não), por isso é uma espera oportunista: quem
  // chama espera sempre pelo elemento que lhe interessa.
  await page.waitForSelector("[data-hidratado='1']", { timeout: 8_000 }).catch(() => undefined);
}

/**
 * Preenche um campo controlado e confirma que o React o registou.
 *
 * Os campos são controlados: escrever antes da hidratação perde o que se
 * escreveu, sem erro nenhum. A asserção do valor é o que garante que o React
 * já assumiu o formulário.
 */
export async function preencher(page: Page, seletor: string, valor: string) {
  const campo = page.locator(seletor);
  await expect(campo).toBeVisible({ timeout: 20_000 });
  await expect(async () => {
    await campo.fill(valor);
    await expect(campo).toHaveValue(valor, { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
}
