import { useFrame, useThree } from "@react-three/fiber";
import {
  clearOcclusionHysteresis,
  resetOcclusionStats,
  setOcclusionCamera,
} from "./occlusion-cull";
import { useEffect } from "react";

/**
 * Copia a posição XZ da câmara para o sistema de occlusion (1×/frame).
 * Prioridade -9: depois do frustum (-10), antes da lógica das figuras.
 */
export function OcclusionUpdater({ placeId }: { placeId?: string }) {
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    clearOcclusionHysteresis();
  }, [placeId]);

  useFrame(() => {
    resetOcclusionStats();
    setOcclusionCamera(camera.position.x, camera.position.z);
  }, -9);

  return null;
}
