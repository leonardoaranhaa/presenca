/**
 * Estado real dos serviços que dependem de configuração externa.
 *
 * A app deixa criar memoriais, escrever no cofre e escolher clonar uma voz
 * como se tudo fosse funcionar. Se a chave não estiver posta, a conversa
 * responde 503 só depois de a pessoa escrever — e o produto parece partido em
 * vez de por configurar. Isto permite à UI dizer a verdade antes.
 *
 * **Não expõe segredos**: só se cada chave existe, nunca o valor.
 */

export type ServiceStatus = {
  /** A conversa com a presença precisa de chave de IA. */
  chat: boolean;
  /** Voz clonada (ElevenLabs). Sem isto, a presença fala pelo leitor do aparelho. */
  voiceClone: boolean;
  /** Modo do TURN, que decide se o WebRTC atravessa redes móveis. */
  turn: "ephemeral" | "static" | "stun-only";
  /** LiveKit SFU configurado (URL + API key + secret). */
  livekit: boolean;
  /** Gerador 3D de avatares a partir de fotos. Sem isto o pedido devolve
   *  needs_provider e a família tem de associar um GLB à mão. */
  avatarMesh: boolean;
};

export function serviceStatus(): ServiceStatus {
  const turnUrls = (process.env.TURN_URLS || "").trim();
  const temTurn = turnUrls.length > 0;

  return {
    chat: !!process.env.XAI_API_KEY,
    voiceClone: !!process.env.ELEVENLABS_API_KEY,
    turn:
      temTurn && process.env.TURN_SECRET
        ? "ephemeral"
        : temTurn && process.env.TURN_STATIC_USERNAME && process.env.TURN_STATIC_CREDENTIAL
          ? "static"
          : "stun-only",
    livekit: !!(
      (process.env.LIVEKIT_URL || process.env.VITE_LIVEKIT_URL)?.trim() &&
      process.env.LIVEKIT_API_KEY?.trim() &&
      process.env.LIVEKIT_API_SECRET?.trim()
    ),
    avatarMesh: !!(
      process.env.AVATAR_MESH_API_URL?.trim() && process.env.AVATAR_MESH_API_KEY?.trim()
    ),
  };
}

export function handleStatus(req: Request): Response {
  if (req.method !== "GET") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  return Response.json(serviceStatus(), {
    headers: { "Cache-Control": "public, max-age=60" },
  });
}
