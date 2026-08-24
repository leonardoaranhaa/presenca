import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleCompleteAvatarJob, handleCreateAvatarJob, handleGetAvatarJob } from "../avatar-http";
import { resetRateLimits } from "../rate-limit";

/**
 * O pipeline de avatares toca em três coisas delicadas: um email de contacto,
 * um URL de modelo que vai ser carregado dentro do lar da família, e um alvo
 * de deploy serverless onde a memória do processo não sobrevive ao pedido.
 */

const ORIGINAL = { ...process.env };

beforeEach(() => {
  resetRateLimits();
  delete process.env.AVATAR_MESH_API_URL;
  delete process.env.AVATAR_MESH_API_KEY;
  delete process.env.AVATAR_ADMIN_TOKEN;
});
afterEach(() => {
  process.env = { ...ORIGINAL };
  resetRateLimits();
});

function criar(body: unknown) {
  return new Request("https://presenca.app/api/avatar/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const PEDIDO_VALIDO = {
  personaId: "persona_antonio",
  path: "self_service" as const,
  contactEmail: "familia@exemplo.pt",
  photoCount: 6,
  videoCount: 0,
};

describe("POST /api/avatar/jobs", () => {
  it("devolve já o estado final quando não há gerador configurado", async () => {
    const res = await handleCreateAvatarJob(criar(PEDIDO_VALIDO));
    expect(res.status).toBe(201);
    const { job } = await res.json();

    // Sem isto o cliente teria de voltar com um GET — e em serverless o job
    // pode ter nascido noutra instância, que não sabe nada dele.
    expect(job.status).toBe("needs_provider");
    expect(job.message).toMatch(/AVATAR_MESH_API_URL/);
  });

  it("o caminho studio também se decide no próprio pedido", async () => {
    const res = await handleCreateAvatarJob(criar({ ...PEDIDO_VALIDO, path: "studio" }));
    const { job } = await res.json();
    expect(job.status).toBe("needs_provider");
    expect(job.message).toMatch(/studio/i);
  });

  it("não devolve o email de contacto nem as URLs das imagens", async () => {
    const res = await handleCreateAvatarJob(
      criar({ ...PEDIDO_VALIDO, imageUrls: ["https://exemplo.pt/1.jpg"] }),
    );
    const { job } = await res.json();

    // O id é um UUID, não uma sessão: quem o apanhar não pode ler dados de
    // quem pediu o avatar.
    expect(job).not.toHaveProperty("contactEmail");
    expect(job).not.toHaveProperty("imageUrls");
    expect(JSON.stringify(job)).not.toContain("familia@exemplo.pt");
  });

  it("recusa data URLs, que não servem ao fornecedor e incham o pedido", async () => {
    const res = await handleCreateAvatarJob(
      criar({ ...PEDIDO_VALIDO, imageUrls: ["data:image/png;base64,AAAA"] }),
    );
    expect(res.status).toBe(400);
  });

  it("exige pelo menos uma foto ou vídeo", async () => {
    const res = await handleCreateAvatarJob(
      criar({ ...PEDIDO_VALIDO, photoCount: 0, videoCount: 0 }),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/avatar/jobs/:id", () => {
  it("também não deixa sair o email de contacto", async () => {
    const criado = await (await handleCreateAvatarJob(criar(PEDIDO_VALIDO))).json();
    const res = await handleGetAvatarJob(new Request("https://presenca.app/x"), criado.job.id);
    const { job } = await res.json();
    expect(job).not.toHaveProperty("contactEmail");
  });

  it("um id que não existe dá 404, não 500", async () => {
    const res = await handleGetAvatarJob(new Request("https://presenca.app/x"), "nao-existe");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/avatar/jobs/:id — completar", () => {
  function completar(id: string, body: unknown, headers: Record<string, string> = {}) {
    return handleCompleteAvatarJob(
      new Request("https://presenca.app/api/avatar/jobs/" + id, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      }),
      id,
    );
  }

  it("recusa sem credencial — este endpoint injeta um modelo no lar", async () => {
    const criado = await (await handleCreateAvatarJob(criar(PEDIDO_VALIDO))).json();
    const res = await completar(criado.job.id, { resultGlbUrl: "https://mau.exemplo/x.glb" });
    expect(res.status).toBe(401);
  });

  it("recusa mesmo com credencial se AVATAR_ADMIN_TOKEN não estiver posto", async () => {
    const criado = await (await handleCreateAvatarJob(criar(PEDIDO_VALIDO))).json();
    const res = await completar(
      criado.job.id,
      { resultGlbUrl: "https://ok.exemplo/x.glb" },
      { authorization: "Bearer o-que-for" },
    );
    // Falhar fechado: sem segredo configurado não há nada a comparar.
    expect(res.status).toBe(401);
  });

  it("aceita com a credencial certa", async () => {
    process.env.AVATAR_ADMIN_TOKEN = "segredo-da-equipa";
    const criado = await (await handleCreateAvatarJob(criar(PEDIDO_VALIDO))).json();
    const res = await completar(
      criado.job.id,
      { resultGlbUrl: "https://cdn.exemplo/antonio.glb" },
      { authorization: "Bearer segredo-da-equipa" },
    );
    expect(res.status).toBe(200);
    const { job } = await res.json();
    expect(job.status).toBe("ready");
    expect(job.resultGlbUrl).toBe("https://cdn.exemplo/antonio.glb");
  });

  it("recusa um token errado do mesmo comprimento", async () => {
    process.env.AVATAR_ADMIN_TOKEN = "segredo-da-equipa";
    const criado = await (await handleCreateAvatarJob(criar(PEDIDO_VALIDO))).json();
    const res = await completar(
      criado.job.id,
      { resultGlbUrl: "https://cdn.exemplo/x.glb" },
      { authorization: "Bearer segredo-da-equipb" },
    );
    expect(res.status).toBe(401);
  });

  it("recusa um GLB que não seja https nem do próprio site", async () => {
    process.env.AVATAR_ADMIN_TOKEN = "segredo-da-equipa";
    const criado = await (await handleCreateAvatarJob(criar(PEDIDO_VALIDO))).json();
    for (const url of [
      "javascript:alert(1)",
      "http://inseguro.exemplo/x.glb",
      "data:model/gltf-binary;base64,AA",
    ]) {
      const res = await completar(
        criado.job.id,
        { resultGlbUrl: url },
        { authorization: "Bearer segredo-da-equipa" },
      );
      expect(res.status, url).toBe(400);
    }
  });
});
