import { useEffect, useState } from "react";

export type ServiceStatus = {
  chat: boolean;
  voiceClone: boolean;
  turn: "ephemeral" | "static" | "stun-only";
  livekit?: boolean;
  avatarMesh?: boolean;
};

/**
 * O que está mesmo ligado neste ambiente.
 *
 * `undefined` enquanto carrega; `null` se o pedido falhar — nesse caso a UI
 * não deve afirmar nada, nem que está ligado nem que está em baixo.
 */
export function useServiceStatus(): ServiceStatus | null | undefined {
  const [estado, setEstado] = useState<ServiceStatus | null | undefined>(undefined);

  useEffect(() => {
    let vivo = true;
    fetch("/api/status")
      .then((r) => (r.ok ? (r.json() as Promise<ServiceStatus>) : null))
      .then((s) => vivo && setEstado(s))
      .catch(() => vivo && setEstado(null));
    return () => {
      vivo = false;
    };
  }, []);

  return estado;
}
