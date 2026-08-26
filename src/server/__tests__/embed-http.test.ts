import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleEmbed } from "../embed-http";
import { RATE_LIMITS, resetRateLimits } from "../rate-limit";

const ORIGINAL = { ...process.env };

beforeEach(() => {
  resetRateLimits();
  delete process.env.EMBEDDING_API_URL;
  delete process.env.EMBEDDING_API_KEY;
  delete process.env.XAI_API_KEY;
});
afterEach(() => {
  process.env = { ...ORIGINAL };
  resetRateLimits();
});

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://presenca.app/api/embed", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/embed", () => {
  it("rejeita JSON inválido", async () => {
    const res = await handleEmbed(
      new Request("https://presenca.app/api/embed", { method: "POST", body: "{{{" }),
    );
    expect(res.status).toBe(400);
  });

  it("rejeita lista vazia", async () => {
    expect((await handleEmbed(post({ texts: [] }))).status).toBe(400);
  });

  it("rejeita mais de 32 textos", async () => {
    const res = await handleEmbed(post({ texts: Array(33).fill("memória") }));
    expect(res.status).toBe(400);
  });

  it("rejeita texto acima do limite", async () => {
    const res = await handleEmbed(post({ texts: ["x".repeat(8001)] }));
    expect(res.status).toBe(400);
  });

  it("sem fornecedor configurado responde 503", async () => {
    expect((await handleEmbed(post({ texts: ["a goiabeira"] }))).status).toBe(503);
  });

  it("tem limite de pedidos — cada um vai a um fornecedor pago", async () => {
    const { limit } = RATE_LIMITS.embed;
    for (let i = 0; i < limit; i++) {
      const r = await handleEmbed(post({ texts: ["x"] }, { "x-real-ip": "198.51.100.7" }));
      expect(r.status).not.toBe(429);
    }
    const bloqueado = await handleEmbed(post({ texts: ["x"] }, { "x-real-ip": "198.51.100.7" }));
    expect(bloqueado.status).toBe(429);
  });

  it("recusa métodos que não POST", async () => {
    const res = await handleEmbed(new Request("https://presenca.app/api/embed"));
    expect(res.status).toBe(405);
  });
});
