import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { comLog } from "../log";

let linhas: string[] = [];

beforeEach(() => {
  linhas = [];
  const captura = (...args: unknown[]) => linhas.push(String(args[0]));
  vi.spyOn(console, "info").mockImplementation(captura);
  vi.spyOn(console, "warn").mockImplementation(captura);
  vi.spyOn(console, "error").mockImplementation(captura);
});
afterEach(() => vi.restoreAllMocks());

function req(headers: Record<string, string> = {}) {
  return new Request("https://p.app/api/chat", { method: "POST", headers });
}

function ultimoLog() {
  return JSON.parse(linhas[linhas.length - 1]!) as Record<string, unknown>;
}

describe("comLog", () => {
  it("regista evento, estado e duração em JSON de uma linha", async () => {
    await comLog("chat", req(), async () => Response.json({ ok: true }));
    const log = ultimoLog();
    expect(log.evento).toBe("chat");
    expect(log.status).toBe(200);
    expect(typeof log.ms).toBe("number");
    expect(typeof log.requestId).toBe("string");
  });

  it("devolve o requestId no cabeçalho, para quem reporta poder citá-lo", async () => {
    const res = await comLog("chat", req(), async () => Response.json({ ok: true }));
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(res.headers.get("x-request-id")).toBe(ultimoLog().requestId);
  });

  it("respeita um x-request-id que já venha do proxy", async () => {
    const res = await comLog("chat", req({ "x-request-id": "abc123" }), async () =>
      Response.json({ ok: true }),
    );
    expect(res.headers.get("x-request-id")).toBe("abc123");
    expect(ultimoLog().requestId).toBe("abc123");
  });

  it("preserva o corpo e o estado da resposta original", async () => {
    const res = await comLog("chat", req(), async () =>
      Response.json({ texto: "come, que esfria" }, { status: 201 }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ texto: "come, que esfria" });
  });

  it("uma exceção não escapa: vira 500 com id para investigar", async () => {
    const res = await comLog("chat", req(), async () => {
      throw new Error("rebentou a ligação à base");
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string; requestId: string };
    expect(body.requestId).toBeTruthy();
    // A mensagem interna fica no log, não na resposta ao utilizador.
    expect(body.error).not.toMatch(/rebentou/);
    expect(String(ultimoLog().erro)).toMatch(/rebentou/);
  });

  it("4xx é aviso e 5xx é erro", async () => {
    await comLog("chat", req(), async () => Response.json({}, { status: 400 }));
    expect(ultimoLog().nivel).toBe("warn");
    await comLog("chat", req(), async () => Response.json({}, { status: 502 }));
    expect(ultimoLog().nivel).toBe("error");
  });

  it("não regista conteúdo de mensagens nem de memórias", async () => {
    await comLog("chat", req(), async () =>
      Response.json({ text: "uma memória privada da família" }),
    );
    expect(linhas.join("\n")).not.toMatch(/memória privada/);
  });
});
