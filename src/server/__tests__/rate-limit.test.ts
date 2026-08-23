import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkRateLimit,
  clientKey,
  RATE_LIMITS,
  resetRateLimits,
  tooManyRequests,
} from "../rate-limit";
import { handleChat } from "../ai-http";

beforeEach(() => resetRateLimits());
afterEach(() => resetRateLimits());

describe("clientKey", () => {
  it("prefere x-real-ip", () => {
    const r = new Request("https://p.app/", { headers: { "x-real-ip": "203.0.113.7" } });
    expect(clientKey(r)).toBe("203.0.113.7");
  });

  it("usa o primeiro endereço de x-forwarded-for", () => {
    const r = new Request("https://p.app/", {
      headers: { "x-forwarded-for": "203.0.113.7, 198.51.100.1" },
    });
    expect(clientKey(r)).toBe("203.0.113.7");
  });

  it("não rebenta sem cabeçalhos", () => {
    expect(clientKey(new Request("https://p.app/"))).toBe("desconhecido");
  });
});

describe("checkRateLimit", () => {
  it("deixa passar até ao limite e bloqueia a seguir", () => {
    const { limit } = RATE_LIMITS.chat;
    for (let i = 0; i < limit; i++) {
      expect(checkRateLimit("chat", "ip").allowed).toBe(true);
    }
    expect(checkRateLimit("chat", "ip").allowed).toBe(false);
  });

  it("conta cada cliente em separado", () => {
    for (let i = 0; i < RATE_LIMITS.chat.limit; i++) checkRateLimit("chat", "a");
    expect(checkRateLimit("chat", "a").allowed).toBe(false);
    expect(checkRateLimit("chat", "b").allowed).toBe(true);
  });

  it("conta cada rota em separado", () => {
    for (let i = 0; i < RATE_LIMITS.awaken.limit; i++) checkRateLimit("awaken", "ip");
    expect(checkRateLimit("awaken", "ip").allowed).toBe(false);
    expect(checkRateLimit("chat", "ip").allowed).toBe(true);
  });

  it("a janela desliza — reabre depois de passar", () => {
    const t0 = 1_000_000;
    const { limit, windowMs } = RATE_LIMITS.chat;
    for (let i = 0; i < limit; i++) checkRateLimit("chat", "ip", t0);
    expect(checkRateLimit("chat", "ip", t0).allowed).toBe(false);
    expect(checkRateLimit("chat", "ip", t0 + windowMs + 1).allowed).toBe(true);
  });

  it("indica quantos segundos faltam", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < RATE_LIMITS.chat.limit; i++) checkRateLimit("chat", "ip", t0);
    const r = checkRateLimit("chat", "ip", t0 + 10_000);
    expect(r.allowed).toBe(false);
    expect(r.retryAfter).toBeGreaterThan(0);
    expect(r.retryAfter).toBeLessThanOrEqual(RATE_LIMITS.chat.windowMs / 1000);
  });

  it("as rotas caras são mais restritas do que a conversa", () => {
    expect(RATE_LIMITS.awaken.limit).toBeLessThan(RATE_LIMITS.chat.limit);
    expect(RATE_LIMITS.voiceClone.limit).toBeLessThan(RATE_LIMITS.chat.limit);
  });
});

describe("tooManyRequests", () => {
  it("responde 429 com os cabeçalhos padrão", () => {
    const res = tooManyRequests("chat", { allowed: false, remaining: 0, retryAfter: 42 });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(res.headers.get("RateLimit-Limit")).toBe(String(RATE_LIMITS.chat.limit));
  });
});

describe("as rotas aplicam o limite", () => {
  function pedido() {
    return new Request("https://p.app/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-real-ip": "203.0.113.9" },
      body: JSON.stringify({
        persona: {
          name: "Antônio",
          kind: "memorial",
          relationship: "Avô",
          bio: "",
          traits: [],
          speechNotes: "",
          favorites: "",
          memories: [],
        },
        history: [],
        message: "olá",
      }),
    });
  }

  it("/api/chat devolve 429 depois de esgotado", async () => {
    for (let i = 0; i < RATE_LIMITS.chat.limit; i++) {
      const r = await handleChat(pedido());
      expect(r.status).not.toBe(429);
    }
    const bloqueado = await handleChat(pedido());
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.headers.get("Retry-After")).toBeTruthy();
  });

  it("a mensagem de bloqueio é em português e sem detalhes técnicos", async () => {
    for (let i = 0; i < RATE_LIMITS.chat.limit; i++) await handleChat(pedido());
    const body = (await (await handleChat(pedido())).json()) as { error: string };
    expect(body.error).toMatch(/pedidos/i);
    expect(body.error).not.toMatch(/rate|limit|bucket/i);
  });
});
