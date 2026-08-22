/**
 * Camada de API de voz usada pelo cliente e pelos route handlers.
 * createServerFn (TanStack Start) pode reexportar estas funções no servidor.
 */
import { cloneVoice, synthesizeSpeech } from "@/server/voice";

export async function apiCloneVoice(input: {
  personaId: string;
  name: string;
  samples: string[];
}) {
  return cloneVoice(input);
}

export async function apiTts(input: { text: string; voiceId: string; modelId?: string }) {
  return synthesizeSpeech(input);
}
