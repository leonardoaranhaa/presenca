/**
 * TanStack Start — createServerFn wrappers.
 * Se createServerFn não estiver no bundle (projeto só Vite),
 * o cliente continua usando fetch('/api/voice/...').
 */
import { cloneVoice, synthesizeSpeech } from "./voice";

type CloneInput = {
  data: {
    personaId: string;
    name: string;
    samples: string[];
  };
};

type TtsInput = {
  data: {
    text: string;
    voiceId: string;
    modelId?: string;
  };
};

/**
 * Uso com createServerFn:
 *
 * import { createServerFn } from '@tanstack/react-start'
 * export const cloneVoiceFn = createServerFn({ method: 'POST' })
 *   .handler(async ({ data }) => cloneVoiceHandler({ data }))
 */
export async function cloneVoiceHandler({ data }: CloneInput) {
  return cloneVoice({
    personaId: data.personaId,
    name: data.name,
    samples: data.samples,
  });
}

export async function ttsHandler({ data }: TtsInput) {
  const result = await synthesizeSpeech({
    text: data.text,
    voiceId: data.voiceId,
    modelId: data.modelId,
  });
  if (!result.ok) return result;
  // Em server fn, devolver base64 para o cliente tocar
  const b64 = Buffer.from(result.audio).toString("base64");
  return {
    ok: true as const,
    contentType: result.contentType,
    base64: b64,
  };
}
