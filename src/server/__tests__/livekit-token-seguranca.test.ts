import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleLiveKitToken } from "../livekit-token";
import { RATE_LIMITS, resetRateLimits } from "../rate-limit";

/**
 * Esta rota entrega **acesso**, não só custo: um token com `roomJoin` e
 * `canPublish` para o lugar pedido. Os nomes de sala vêm dos ids de lugar
 * (`place_casa_oliveira`), que são adivinháveis.
 */

const ORIGINAL = { ...process.env };

beforeEach(() => {
  resetRateLimits();
  process.env.LIVEKIT_API_KEY = "chave-de-teste";
  process.env.LIVEKIT_API_SECRET = "segredo-de-teste";
  process.env.LIVEKIT_URL = "wss://exemplo.livekit.cloud";
});
afterEach(() => {
  process.env = { ...ORIGINAL };
  resetRateLimits();
});

function pedido(qs: string, headers: Record<string, string> = {}) {
  return new Request(`https://presenca.app/api/livekit/token?${qs}`, { headers });
}

describe("GET /api/livekit/token", () => {
  it("emite token para um pedido do próprio site", async () => {
    const res = await handleLiveKitToken(pedido("room=place_casa&identity=peer_1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; expiresIn: number };
    expect(body.token.split(".")).toHaveLength(3); // JWT
  });

  it("recusa pedidos de outra origem", async () => {
    // Sem isto, qualquer site podia pedir a chave do lar de uma família.
    const res = await handleLiveKitToken(
      pedido("room=place_casa&identity=intruso", { origin: "https://atacante.example" }),
    );
    expect(res.status).toBe(403);
  });

  it("aceita a própria origem", async () => {
    const res = await handleLiveKitToken(
      pedido("room=place_casa&identity=peer_1", { origin: "https://presenca.app" }),
    );
    expect(res.status).toBe(200);
  });

  it("trava a enumeração de nomes de sala", async () => {
    // Sem limite, dá para varrer ids de lugar até acertar num que exista.
    const { limit } = RATE_LIMITS.livekitToken;
    for (let i = 0; i < limit; i++) {
      const r = await handleLiveKitToken(
        pedido(`room=place_tentativa_${i}&identity=x`, { "x-real-ip": "203.0.113.1" }),
      );
      expect(r.status).not.toBe(429);
    }
    const bloqueado = await handleLiveKitToken(
      pedido("room=place_mais_uma&identity=x", { "x-real-ip": "203.0.113.1" }),
    );
    expect(bloqueado.status).toBe(429);
  });

  it("o token dura uma visita, não um dia de trabalho", async () => {
    const res = await handleLiveKitToken(pedido("room=place_casa&identity=peer_1"));
    const { expiresIn } = (await res.json()) as { expiresIn: number };
    expect(expiresIn).toBeLessThanOrEqual(60 * 60);
  });

  it("exige room e identity", async () => {
    expect((await handleLiveKitToken(pedido("room=place_casa"))).status).toBe(400);
    expect((await handleLiveKitToken(pedido("identity=peer_1"))).status).toBe(400);
  });

  it("sanitiza o nome da sala", async () => {
    const res = await handleLiveKitToken(
      pedido(`room=${encodeURIComponent("../outra sala!")}&identity=peer_1`),
    );
    const { room } = (await res.json()) as { room: string };
    expect(room).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  it("sem LiveKit configurado responde 503, não 500", async () => {
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;
    const res = await handleLiveKitToken(pedido("room=place_casa&identity=peer_1"));
    expect(res.status).toBe(503);
  });

  it("recusa métodos que não GET", async () => {
    const res = await handleLiveKitToken(
      new Request("https://presenca.app/api/livekit/token?room=a&identity=b", { method: "POST" }),
    );
    expect(res.status).toBe(405);
  });
});
