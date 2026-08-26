import { useEffect, useRef } from "react";
import type { Persona } from "@/lib/types";
import { Sensation, loadSensationPrefs } from "@/lib/sensation";
import { gestureAnchor } from "./gesture-vfx";
import { ROOM_SPAWNS } from "@/lib/types";

/**
 * Quando o jogador entra na zona de uma persona, dispara “presence”.
 * Abraço automático só se memorialConsent + muito perto + prefs.
 */
export function SensationBridge({
  personas,
  nearestId,
  nearestDist,
  playerId,
}: {
  personas: Persona[];
  nearestId: string | null;
  nearestDist: number;
  playerId: string;
}) {
  const lastPresence = useRef<string | null>(null);
  const lastHug = useRef(0);

  useEffect(() => {
    loadSensationPrefs();
  }, []);

  useEffect(() => {
    if (!nearestId || nearestId === playerId) return;
    const p = personas.find((x) => x.id === nearestId);
    if (!p) return;
    const kind = p.kind === "memorial" ? "memorial" : "living";

    // entrada na zona ~2.2 m
    if (nearestDist < 2.2 && lastPresence.current !== nearestId) {
      lastPresence.current = nearestId;
      // VFX no meio do caminho jogador↔persona (âncora já segue jogador; offset leve)
      const spawn = ROOM_SPAWNS[p.room] ?? { x: 0, z: 0 };
      gestureAnchor.x = (gestureAnchor.x + spawn.x) * 0.5;
      gestureAnchor.z = (gestureAnchor.z + spawn.z) * 0.5;
      void Sensation.presenceNear(p.id, p.name, kind);
    }
    if (nearestDist > 3.5) {
      if (lastPresence.current === nearestId) lastPresence.current = null;
    }

    // abraço simbólico só se muito perto (ex.: após path do NPC)
    if (nearestDist < 1.35 && Date.now() - lastHug.current > 12000) {
      // não auto-abraça sempre — só presença memorial com consentimento
      // o jogador também pode pedir pelo HUD; aqui só “presence” reforçada
      if (kind === "living" && nearestDist < 1.2) {
        lastHug.current = Date.now();
        void Sensation.offerHand(p.id, p.name, kind);
      }
    }
  }, [nearestId, nearestDist, personas, playerId]);

  return null;
}
