import { beforeEach, describe, expect, it } from "vitest";
import { POLICY_VERSION } from "@/lib/lgpd";
import { handleVoiceClone, handleVoiceTts } from "../voice-http";
import { resetRateLimits } from "../rate-limit";

beforeEach(() => resetRateLimits());

/** Amostra de áudio válida e pequena. */
const AMOSTRA = "data:audio/mpeg;base64," + "A".repeat(400);

const CONSENTIMENTO = {
  allowVoiceClone: true,
  memorialFamilyAuthority: true,
  policyVersion: POLICY_VERSION,
  acceptedAt: Date.now(),
};

function post(body: unknown, path = "/api/voice/clone") {
  return new Request(`https://p.app${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function erro(res: Response) {
  return ((await res.json()) as { error: string }).error;
}

describe("POST /api/voice/clone — consentimento", () => {
  it("recusa sem registo de consentimento", async () => {
    // Regressão: o servidor aceitava qualquer pedido e criava uma voz na conta
    // de quem hospeda. O consentimento era um `true` escrito na UI.
    const res = await handleVoiceClone(
      post({ personaId: "p1", name: "Antônio", samples: [AMOSTRA] }),
    );
    expect(res.status).toBe(400);
  });

  it("recusa se o clone de voz não estiver ativado", async () => {
    const res = await handleVoiceClone(
      post({
        personaId: "p1",
        name: "Antônio",
        samples: [AMOSTRA],
        consent: { ...CONSENTIMENTO, allowVoiceClone: false },
      }),
    );
    expect(res.status).toBe(400);
    expect(await erro(res)).toMatch(/preferências de privacidade/i);
  });

  it("recusa sem declaração de legitimidade familiar", async () => {
    const res = await handleVoiceClone(
      post({
        personaId: "p1",
        name: "Antônio",
        samples: [AMOSTRA],
        consent: { ...CONSENTIMENTO, memorialFamilyAuthority: false },
      }),
    );
    expect(res.status).toBe(400);
    expect(await erro(res)).toMatch(/legitimidade familiar/i);
  });

  it("recusa um aceite de uma versão antiga da política", async () => {
    const res = await handleVoiceClone(
      post({
        personaId: "p1",
        name: "Antônio",
        samples: [AMOSTRA],
        consent: { ...CONSENTIMENTO, policyVersion: "2020-01-01" },
      }),
    );
    expect(res.status).toBe(409);
    expect(await erro(res)).toMatch(/política de privacidade mudou/i);
  });

  it("com consentimento completo passa a validação e só falha por falta de chave", async () => {
    const res = await handleVoiceClone(
      post({ personaId: "p1", name: "Antônio", samples: [AMOSTRA], consent: CONSENTIMENTO }),
    );
    expect(res.status).toBe(503);
  });
});

describe("POST /api/voice/clone — limites de media", () => {
  it("recusa amostras que não são áudio", async () => {
    const res = await handleVoiceClone(
      post({
        personaId: "p1",
        name: "A",
        consent: CONSENTIMENTO,
        samples: ["data:image/png;base64,AAAA"],
      }),
    );
    expect(res.status).toBe(400);
    expect(await erro(res)).toMatch(/áudio/i);
  });

  it("recusa uma amostra acima de 5 MB", async () => {
    const grande = "data:audio/mpeg;base64," + "A".repeat(8 * 1024 * 1024);
    const res = await handleVoiceClone(
      post({ personaId: "p1", name: "A", consent: CONSENTIMENTO, samples: [grande] }),
    );
    expect(res.status).toBe(400);
    expect(await erro(res)).toMatch(/5 MB/);
  });

  it("recusa mais de 5 amostras", async () => {
    const res = await handleVoiceClone(
      post({
        personaId: "p1",
        name: "A",
        consent: CONSENTIMENTO,
        samples: Array(6).fill(AMOSTRA),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("recusa pedido sem amostras", async () => {
    const res = await handleVoiceClone(
      post({ personaId: "p1", name: "A", consent: CONSENTIMENTO, samples: [] }),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/voice/tts", () => {
  it("recusa texto vazio", async () => {
    const res = await handleVoiceTts(post({ text: "", voiceId: "v1" }, "/api/voice/tts"));
    expect(res.status).toBe(400);
  });

  it("recusa sem voiceId", async () => {
    const res = await handleVoiceTts(post({ text: "olá" }, "/api/voice/tts"));
    expect(res.status).toBe(400);
  });

  it("recusa texto acima do limite", async () => {
    const res = await handleVoiceTts(
      post({ text: "x".repeat(1201), voiceId: "v1" }, "/api/voice/tts"),
    );
    expect(res.status).toBe(400);
  });

  it("recusa métodos que não POST", async () => {
    const res = await handleVoiceTts(new Request("https://p.app/api/voice/tts", { method: "GET" }));
    expect(res.status).toBe(405);
  });
});
