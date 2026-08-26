/** Soft limit de vivos na mesma sala (mesh WebRTC). */
export const MAX_PEERS_SOFT = 6;
export const MAX_PEERS_HARD = 12;

export type VoiceTopology = "mesh" | "sfu" | "capped-mesh";

export function peerCapacityWarning(count: number, hasSfu = false): string | null {
  if (count >= MAX_PEERS_HARD) {
    return "Sala cheia. Experimente outro lugar ou volte mais tarde.";
  }
  if (count >= MAX_PEERS_SOFT) {
    if (hasSfu) {
      return "Sala cheia de gente — voz em modo SFU (servidor de áudio).";
    }
    return "Muitas pessoas aqui — voz em malha limitada. Configure SFU em Ajustes → Tempo real.";
  }
  return null;
}

/** Topologia de voz segundo contagem e URL SFU. */
export function resolveVoiceTopology(peerCount: number, sfuUrl?: string | null): VoiceTopology {
  if (peerCount >= MAX_PEERS_SOFT && sfuUrl?.trim()) return "sfu";
  if (peerCount >= MAX_PEERS_SOFT) return "capped-mesh";
  return "mesh";
}
