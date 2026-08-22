/**
 * Voz da presença — ElevenLabs (clone) + fallback Web Speech API.
 *
 * Fluxo memorial:
 * 1. Família sobe amostras de voz no cofre (Memory kind: voice)
 * 2. Servidor cria voice_id no ElevenLabs (com consentimento)
 * 3. Respostas da IA são faladas com essa voice_id
 *
 * Sem ELEVENLABS_API_KEY: usa speechSynthesis do browser (pt-BR).
 */

export type VoiceProvider = "elevenlabs" | "browser";

export interface VoiceProfile {
  provider: VoiceProvider;
  /** ElevenLabs voice_id após clone */
  elevenLabsVoiceId?: string;
  /** Ajuste fino browser TTS */
  rate?: number;
  pitch?: number;
  /** Consentimento explícito da família para clonar */
  consentAt?: number;
}

const DEFAULT_VOICE: VoiceProfile = {
  provider: "browser",
  rate: 0.92,
  pitch: 1,
};

/** Fala no browser (sempre disponível). */
export function speakBrowser(text: string, profile: VoiceProfile = DEFAULT_VOICE) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "pt-BR";
  u.rate = profile.rate ?? 0.95;
  u.pitch = profile.pitch ?? 1;
  window.speechSynthesis.speak(u);
}

/**
 * Solicita TTS ElevenLabs.
 * Em produção isto deve ser um createServerFn que esconde a API key.
 * Retorna URL de áudio (blob) ou null se indisponível.
 */
export async function speakElevenLabs(text: string, voiceId: string): Promise<string | null> {
  try {
    const res = await fetch("/api/voice/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 1200), voiceId }),
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

/** API de clone (amostras do cofre). Placeholder de contrato. */
export async function requestVoiceClone(input: {
  personaId: string;
  name: string;
  sampleDataUrls: string[];
  consent: boolean;
}): Promise<{ ok: true; voiceId: string } | { ok: false; error: string }> {
  if (!input.consent) {
    return { ok: false, error: "É preciso consentimento explícito da família para clonar a voz." };
  }
  if (input.sampleDataUrls.length < 1) {
    return { ok: false, error: "Envie ao menos uma nota de voz no cofre." };
  }
  try {
    const res = await fetch("/api/voice/clone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        personaId: input.personaId,
        name: input.name,
        samples: input.sampleDataUrls.slice(0, 5),
      }),
    });
    if (!res.ok) {
      return {
        ok: false,
        error:
          res.status === 404
            ? "Clone de voz ainda não está ligado neste ambiente. Use o leitor do aparelho por enquanto."
            : `Falha ao clonar voz (${res.status}).`,
      };
    }
    const data = (await res.json()) as { voiceId: string };
    return { ok: true, voiceId: data.voiceId };
  } catch {
    return {
      ok: false,
      error: "Serviço de voz indisponível. A presença continua em texto e no leitor do aparelho.",
    };
  }
}

export async function speakPresence(text: string, profile?: VoiceProfile) {
  const p = profile ?? DEFAULT_VOICE;
  if (p.provider === "elevenlabs" && p.elevenLabsVoiceId) {
    const url = await speakElevenLabs(text, p.elevenLabsVoiceId);
    if (url) {
      const audio = new Audio(url);
      // O blob fica retido enquanto a URL existir. Sem revoke, cada resposta
      // falada deixava um áudio inteiro em memória até fechar o separador.
      const release = () => URL.revokeObjectURL(url);
      audio.addEventListener("ended", release, { once: true });
      audio.addEventListener("error", release, { once: true });
      try {
        await audio.play();
      } catch {
        release();
        speakBrowser(text, p);
      }
      return;
    }
  }
  speakBrowser(text, p);
}

/**
 * Contrato do endpoint de servidor (referência para implementar com ElevenLabs):
 *
 * POST /api/voice/clone
 *   body: { personaId, name, samples: dataUrl[] }
 *   → ElevenLabs Instant Voice Clone / IVC
 *   → { voiceId }
 *
 * POST /api/voice/tts
 *   body: { text, voiceId }
 *   → audio/mpeg stream
 *
 * Env: ELEVENLABS_API_KEY
 * Docs: https://elevenlabs.io/docs/api-reference
 */
