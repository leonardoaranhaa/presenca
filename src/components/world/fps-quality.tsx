import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { usePresence } from "@/lib/store";

/**
 * Se FPS cair de forma sustentada num scan/lugar pesado, força tier mid/low.
 * Não sobe automaticamente (evita oscilação); o utilizador pode voltar a Auto em Ajustes.
 */
export function FpsQualityGuard({ enabled }: { enabled: boolean }) {
  const setQualityTier = usePresence((s) => s.setQualityTier);
  const qualityTier = usePresence((s) => s.qualityTier);
  const frames = useRef(0);
  // 0 = ainda não medido; o primeiro frame define a base. Chamar
  // performance.now() no render dá um valor diferente a cada re-render.
  const last = useRef(0);
  const lowStreak = useRef(0);

  useFrame(() => {
    if (!enabled) return;
    if (last.current === 0) last.current = performance.now();
    frames.current += 1;
    const now = performance.now();
    if (now - last.current < 1000) return;
    const fps = (frames.current * 1000) / (now - last.current);
    frames.current = 0;
    last.current = now;

    if (fps < 28) lowStreak.current += 1;
    else lowStreak.current = Math.max(0, lowStreak.current - 1);

    if (lowStreak.current >= 3 && qualityTier === "auto") {
      setQualityTier(fps < 20 ? "low" : "mid");
      lowStreak.current = 0;
      if (typeof window !== "undefined") {
        (window as unknown as { __presencaFpsDowngrade?: number }).__presencaFpsDowngrade = fps;
      }
    }
  });

  useEffect(() => {
    if (!enabled) lowStreak.current = 0;
  }, [enabled]);

  return null;
}
