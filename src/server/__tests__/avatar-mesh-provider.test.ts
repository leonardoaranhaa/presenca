import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { meshProviderConfigured } from "../avatar-mesh-provider";

/**
 * O conector manda `Authorization: Bearer <chave>` em cada pedido. Onde essa
 * chave pode acabar é a única pergunta que interessa aqui.
 */

const ORIGINAL = { ...process.env };

beforeEach(() => {
  process.env.AVATAR_MESH_API_KEY = "chave-do-fornecedor";
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("meshProviderConfigured", () => {
  it("aceita uma base https", () => {
    process.env.AVATAR_MESH_API_URL = "https://api.meshy.ai";
    expect(meshProviderConfigured()).toBe(true);
  });

  it("recusa http remoto — a chave iria em claro pela rede", () => {
    process.env.AVATAR_MESH_API_URL = "http://api.exemplo.com";
    expect(meshProviderConfigured()).toBe(false);
  });

  it("deixa passar localhost, que é onde corre o mock de desenvolvimento", () => {
    for (const base of ["http://localhost:9099", "http://127.0.0.1:9099"]) {
      process.env.AVATAR_MESH_API_URL = base;
      expect(meshProviderConfigured(), base).toBe(true);
    }
  });

  it("recusa um URL que não se consegue interpretar", () => {
    process.env.AVATAR_MESH_API_URL = "api.meshy.ai";
    expect(meshProviderConfigured()).toBe(false);
  });

  it("sem chave não conta como configurado, mesmo com base válida", () => {
    process.env.AVATAR_MESH_API_URL = "https://api.meshy.ai";
    delete process.env.AVATAR_MESH_API_KEY;
    expect(meshProviderConfigured()).toBe(false);
  });
});
