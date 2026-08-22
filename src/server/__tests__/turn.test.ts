import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { issueTurnCredentials } from "../turn";
import { handleTurnCredentials } from "../turn-http";

const ORIGINAL = { ...process.env };

beforeEach(() => {
  delete process.env.TURN_URLS;
  delete process.env.TURN_SECRET;
  delete process.env.TURN_TTL_SECONDS;
  delete process.env.TURN_STATIC_USERNAME;
  delete process.env.TURN_STATIC_CREDENTIAL;
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("issueTurnCredentials", () => {
  it("sem configuração devolve só STUN", async () => {
    const r = await issueTurnCredentials();
    expect(r.mode).toBe("stun-only");
    expect(r.iceServers.every((s) => String(s.urls).startsWith("stun:"))).toBe(true);
  });

  it("credenciais temporárias seguem o esquema REST do coturn", async () => {
    process.env.TURN_URLS = "turn:exemplo.pt:3478";
    process.env.TURN_SECRET = "segredo";
    process.env.TURN_TTL_SECONDS = "3600";

    const r = await issueTurnCredentials();
    expect(r.mode).toBe("ephemeral");

    const turn = r.iceServers.find((s) => String(s.urls).startsWith("turn:"));
    expect(turn).toBeDefined();
    // username = timestamp de expiração; password = base64(HMAC-SHA1(secret, username))
    expect(turn!.username).toBe(String(r.expiresAt));
    expect(turn!.credential).toBe(
      createHmac("sha1", "segredo").update(String(r.expiresAt)).digest("base64"),
    );
  });

  it("ttl abaixo de 60s é elevado ao mínimo", async () => {
    process.env.TURN_URLS = "turn:exemplo.pt:3478";
    process.env.TURN_SECRET = "segredo";
    process.env.TURN_TTL_SECONDS = "5";
    expect((await issueTurnCredentials()).ttl).toBe(60);
  });

  it("ignora VITE_TURN_URLS — variáveis de cliente não configuram o servidor", async () => {
    process.env.VITE_TURN_URLS = "turn:atacante.example:3478";
    process.env.TURN_SECRET = "segredo";
    expect((await issueTurnCredentials()).mode).toBe("stun-only");
  });

  it("cai para credenciais estáticas quando não há secret", async () => {
    process.env.TURN_URLS = "turn:exemplo.pt:3478";
    process.env.TURN_STATIC_USERNAME = "u";
    process.env.TURN_STATIC_CREDENTIAL = "p";
    expect((await issueTurnCredentials()).mode).toBe("static");
  });
});

describe("handleTurnCredentials", () => {
  it("responde a GET do próprio site", async () => {
    const res = await handleTurnCredentials(
      new Request("https://presenca.app/api/turn/credentials"),
    );
    expect(res.status).toBe(200);
  });

  it("recusa origens externas — o relay não é público", async () => {
    const res = await handleTurnCredentials(
      new Request("https://presenca.app/api/turn/credentials", {
        headers: { origin: "https://atacante.example" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("aceita a própria origem", async () => {
    const res = await handleTurnCredentials(
      new Request("https://presenca.app/api/turn/credentials", {
        headers: { origin: "https://presenca.app" },
      }),
    );
    expect(res.status).toBe(200);
  });

  it("não anuncia CORS para terceiros", async () => {
    const res = await handleTurnCredentials(
      new Request("https://presenca.app/api/turn/credentials"),
    );
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("recusa métodos que não GET", async () => {
    const res = await handleTurnCredentials(
      new Request("https://presenca.app/api/turn/credentials", { method: "POST" }),
    );
    expect(res.status).toBe(405);
  });
});
