/**
 * LGPD — inventário, bases legais e direitos (estrutura para jurídico).
 *
 * Princípio: dados no dispositivo por defeito; envio a terceiros só com base legal
 * e consentimento quando aplicável. Mudanças mínimas no produto = flags e textos,
 * não reescrever o core.
 *
 * Isto NÃO substitui parecer jurídico. É o "esqueleto" que o jurídico preenche.
 */

export type LegalBasis =
  | "consent" // art. 7º, I
  | "contract" // art. 7º, V
  | "legitimate_interest" // art. 7º, IX — uso cuidadoso
  | "vital_interest"
  | "legal_obligation";

export type DataCategory =
  | "account_identity"
  | "persona_profile"
  | "memorial_memories"
  | "voice_biometric" // voz pode ser dado sensível / biométrico em interpretação restrita
  | "body_scan_3d"
  | "chat_content"
  | "realtime_pose"
  | "device_tech"
  | "wellness_usage";

export type ProcessingRecord = {
  id: string;
  category: DataCategory;
  purpose: string;
  basis: LegalBasis;
  storage: "local" | "server" | "third_party";
  thirdParty?: string;
  retention: string;
  sensitive?: boolean;
  canDisable: boolean;
  /** feature flag name in PrivacyPrefs */
  prefKey?: keyof PrivacyPrefs;
};

/** Inventário mínimo — atualizar quando surgir novo processamento. */
export const DATA_INVENTORY: ProcessingRecord[] = [
  {
    id: "personas_local",
    category: "persona_profile",
    purpose: "Criar e manter personas (vivas/memoriais) no lar virtual",
    basis: "consent",
    storage: "local",
    retention: "Até o titular apagar ou limpar dados do browser",
    canDisable: false,
  },
  {
    id: "memories_local",
    category: "memorial_memories",
    purpose: "Reconstrução da presença a partir de histórias e media confiadas",
    basis: "consent",
    storage: "local",
    retention: "Até eliminação pela família/titular",
    canDisable: false,
  },
  {
    id: "chat_local",
    category: "chat_content",
    purpose: "Histórico de conversa com a presença no dispositivo",
    basis: "consent",
    storage: "local",
    retention: "Até apagar conversa ou dados",
    canDisable: true,
    prefKey: "storeChatHistory",
  },
  {
    id: "voice_clone",
    category: "voice_biometric",
    purpose: "Síntese de voz memorial (ex.: ElevenLabs)",
    basis: "consent",
    storage: "third_party",
    thirdParty: "ElevenLabs (ou equivalente)",
    retention: "Conforme política do fornecedor + pedido de exclusão",
    sensitive: true,
    canDisable: true,
    prefKey: "allowVoiceClone",
  },
  {
    id: "body_scan",
    category: "body_scan_3d",
    purpose: "Avatar 3D do utilizador no lar",
    basis: "consent",
    storage: "local",
    retention: "Até remover o scan",
    sensitive: true,
    canDisable: true,
    prefKey: "allowBodyScan",
  },
  {
    id: "realtime_pose",
    category: "realtime_pose",
    purpose: "Posição no lugar partilhado (multiplayer)",
    basis: "consent",
    storage: "server",
    thirdParty: "PartyKit / WebSocket próprio",
    retention: "Efêmero (sessão); sem histórico obrigatório",
    canDisable: true,
    prefKey: "allowRealtime",
  },
  {
    id: "voice_webrtc",
    category: "device_tech",
    purpose: "Áudio em tempo real entre vivos (WebRTC)",
    basis: "consent",
    storage: "local",
    retention: "Não gravamos por defeito; stream P2P",
    canDisable: true,
    prefKey: "allowLiveVoice",
  },
  {
    id: "wellness",
    category: "wellness_usage",
    purpose: "Avisos de uso intenso e modo de saída suave (saúde emocional)",
    basis: "legitimate_interest",
    storage: "local",
    retention: "Contadores do dia no dispositivo",
    canDisable: true,
    prefKey: "allowWellnessNudge",
  },
];

export type PrivacyPrefs = {
  /** Aceite geral da política / termos de uso do produto */
  acceptedPolicyAt: number | null;
  acceptedPolicyVersion: string;
  storeChatHistory: boolean;
  allowVoiceClone: boolean;
  allowBodyScan: boolean;
  allowRealtime: boolean;
  allowLiveVoice: boolean;
  allowWellnessNudge: boolean;
  /** Consentimento memorial: família declara ter legitimidade */
  memorialFamilyAuthority: boolean;
  marketingEmails: boolean;
};

export const POLICY_VERSION = "2026-08-22";

export const DEFAULT_PRIVACY_PREFS: PrivacyPrefs = {
  acceptedPolicyAt: null,
  acceptedPolicyVersion: "",
  storeChatHistory: true,
  allowVoiceClone: false,
  allowBodyScan: true,
  allowRealtime: true,
  allowLiveVoice: true,
  allowWellnessNudge: true,
  memorialFamilyAuthority: false,
  marketingEmails: false,
};

const PREFS_KEY = "presenca_privacy";

export function loadPrivacyPrefs(): PrivacyPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...DEFAULT_PRIVACY_PREFS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_PRIVACY_PREFS };
}

export function savePrivacyPrefs(partial: Partial<PrivacyPrefs>) {
  const next = { ...loadPrivacyPrefs(), ...partial };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function acceptPolicy() {
  return savePrivacyPrefs({
    acceptedPolicyAt: Date.now(),
    acceptedPolicyVersion: POLICY_VERSION,
  });
}

export function hasValidPolicyAcceptance(p: PrivacyPrefs = loadPrivacyPrefs()) {
  return !!p.acceptedPolicyAt && p.acceptedPolicyVersion === POLICY_VERSION;
}

/** Texto curto para UI — o jurídico pode substituir por PDF oficial. */
export const PRIVACY_NOTICE_SHORT = `
Presença trata dados sobretudo no seu aparelho (personas, memórias, chat).
Voz clonada e multiplayer só ocorrem se você ativar e, quando houver fornecedor, com consentimento.
Você pode exportar ou apagar dados locais a qualquer momento.
Voz e corpo 3D são tratados com cuidado especial.
Isto não substitui a Política de Privacidade completa nem o parecer jurídico.
`.trim();

export type DataExportBundle = {
  exportedAt: string;
  policyVersion: string;
  privacy: PrivacyPrefs;
  note: string;
};

/**
 * Gatilhos que o jurídico pode pedir com mudanças mínimas:
 * - POLICY_VERSION sobe → novo aceite
 * - prefKey desliga feature sem remover código
 * - DATA_INVENTORY documenta cada fluxo
 */
export function featureAllowed(
  key: keyof PrivacyPrefs,
  prefs: PrivacyPrefs = loadPrivacyPrefs(),
): boolean {
  if (key === "acceptedPolicyAt" || key === "acceptedPolicyVersion") return true;
  const v = prefs[key];
  return typeof v === "boolean" ? v : true;
}
