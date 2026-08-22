/**
 * Handlers de voz — ElevenLabs.
 *
 * Em TanStack Start, exponha via createServerFn ou route handlers:
 *   POST /api/voice/clone
 *   POST /api/voice/tts
 *
 * Env: ELEVENLABS_API_KEY
 * Docs: https://elevenlabs.io/docs/api-reference
 */

const ELEVEN_BASE = "https://api.elevenlabs.io/v1";

function apiKey(): string | undefined {
  return typeof process !== "undefined" ? process.env.ELEVENLABS_API_KEY : undefined;
}

export type CloneBody = {
  personaId: string;
  name: string;
  /** data URLs audio/* (mp3, wav, webm) — máx. ~5 amostras */
  samples: string[];
};

export type TtsBody = {
  text: string;
  voiceId: string;
  /** modelo ElevenLabs; default multilingual para pt-BR */
  modelId?: string;
};

function dataUrlToBlob(dataUrl: string): { blob: Blob; name: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;
  const mime = m[1];
  const bin = Buffer.from(m[2], "base64");
  const ext = mime.includes("wav") ? "wav" : mime.includes("mpeg") || mime.includes("mp3") ? "mp3" : "webm";
  return { blob: new Blob([bin], { type: mime }), name: `sample.${ext}` };
}

/** Instant Voice Clone (IVC) a partir de amostras do cofre. */
export async function cloneVoice(
  body: CloneBody,
): Promise<{ ok: true; voiceId: string } | { ok: false; error: string; status?: number }> {
  const key = apiKey();
  if (!key) {
    return {
      ok: false,
      error: "ELEVENLABS_API_KEY não configurada. A presença usa o leitor do aparelho.",
      status: 503,
    };
  }
  if (!body.samples?.length) {
    return { ok: false, error: "Envie ao menos uma nota de voz no cofre.", status: 400 };
  }

  const form = new FormData();
  form.append("name", `Presença · ${body.name}`.slice(0, 100));
  form.append(
    "description",
    `Clone memorial (consentimento da família). persona=${body.personaId}`,
  );
  // remove background noise when possible
  form.append("remove_background_noise", "true");

  let added = 0;
  for (const s of body.samples.slice(0, 5)) {
    const parsed = dataUrlToBlob(s);
    if (!parsed) continue;
    form.append("files", parsed.blob, parsed.name);
    added++;
  }
  if (added === 0) {
    return { ok: false, error: "Nenhuma amostra de áudio válida.", status: 400 };
  }

  try {
    const res = await fetch(`${ELEVEN_BASE}/voices/add`, {
      method: "POST",
      headers: { "xi-api-key": key },
      body: form,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return {
        ok: false,
        error: `ElevenLabs clone falhou (${res.status}). ${t.slice(0, 200)}`,
        status: res.status,
      };
    }
    const data = (await res.json()) as { voice_id?: string };
    if (!data.voice_id) {
      return { ok: false, error: "Resposta sem voice_id.", status: 502 };
    }
    return { ok: true, voiceId: data.voice_id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Falha de rede ao clonar voz.",
      status: 502,
    };
  }
}

/** Text-to-speech com voice_id clonado. Retorna bytes de áudio MPEG. */
export async function synthesizeSpeech(
  body: TtsBody,
): Promise<{ ok: true; audio: ArrayBuffer; contentType: string } | { ok: false; error: string; status?: number }> {
  const key = apiKey();
  if (!key) {
    return { ok: false, error: "ELEVENLABS_API_KEY não configurada.", status: 503 };
  }
  const text = (body.text || "").trim().slice(0, 1200);
  if (!text) return { ok: false, error: "Texto vazio.", status: 400 };
  if (!body.voiceId) return { ok: false, error: "voiceId obrigatório.", status: 400 };

  try {
    const res = await fetch(
      `${ELEVEN_BASE}/text-to-speech/${encodeURIComponent(body.voiceId)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": key,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: body.modelId || "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.8,
            style: 0.2,
            use_speaker_boost: true,
          },
        }),
      },
    );
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return {
        ok: false,
        error: `TTS falhou (${res.status}). ${t.slice(0, 200)}`,
        status: res.status,
      };
    }
    const audio = await res.arrayBuffer();
    return { ok: true, audio, contentType: "audio/mpeg" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Falha de rede no TTS.",
      status: 502,
    };
  }
}
