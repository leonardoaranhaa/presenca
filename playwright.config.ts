import { defineConfig, devices } from "@playwright/test";

/**
 * Testes de ponta a ponta.
 *
 * Correm contra o servidor de desenvolvimento, arrancado automaticamente.
 * Sem chaves de API: cobrem o que tem de funcionar sempre — a app arranca,
 * as páginas renderizam, o mundo 3D abre e as rotas de API respondem.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "list" : "html",
  timeout: 60_000,

  use: {
    baseURL: "http://127.0.0.1:8080",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // O mundo é WebGL: sem swiftshader o Chromium headless não tem
        // contexto 3D e o canvas fica a zero.
        launchOptions: {
          args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
          // Permite usar um Chromium já presente na máquina (CI com browsers
          // pré-instalados) em vez de descarregar outro. Sem a variável,
          // usa-se o que o `playwright install` colocou.
          ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
        },
      },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:8080",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
