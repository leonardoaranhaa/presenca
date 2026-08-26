import { useEffect, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { usePresence } from "@/lib/store";
import { findPath, setNavDestination, getNavMesh, snapToNavMesh } from "./navmesh";

/**
 * XR: qualidade low na sessão VR; teleport (T ou trigger futuro) via NavMesh.
 */
export function XrSessionBootstrap({
  playerPos,
  playerYaw,
}: {
  playerPos: React.MutableRefObject<THREE.Vector3>;
  /**
   * Orientação do jogador. Vem do `PlayerRig`, não de `worldInput` — este só
   * guarda entrada bruta (teclas, joystick, delta do olhar), nunca o estado
   * resolvido. A versão anterior lia `worldInput.yaw`, que não existe: o
   * teleporte calculava com `undefined` e o destino saía NaN.
   */
  playerYaw: React.RefObject<number>;
}) {
  const gl = useThree((s) => s.gl);
  const setQualityTier = usePresence((s) => s.setQualityTier);

  useEffect(() => {
    const renderer = gl as THREE.WebGLRenderer;
    if (!renderer?.xr) return;

    // Expor para o botão UI fora do canvas
    (window as unknown as { __presencaGl?: THREE.WebGLRenderer }).__presencaGl = renderer;
    try {
      renderer.xr.enabled = true;
    } catch {
      /* ignore */
    }

    const onStart = () => {
      setQualityTier("low");
      (window as unknown as { __presencaXr?: boolean }).__presencaXr = true;
    };
    const onEnd = () => {
      setQualityTier("auto");
      (window as unknown as { __presencaXr?: boolean }).__presencaXr = false;
    };

    renderer.xr.addEventListener("sessionstart", onStart);
    renderer.xr.addEventListener("sessionend", onEnd);
    return () => {
      renderer.xr.removeEventListener("sessionstart", onStart);
      renderer.xr.removeEventListener("sessionend", onEnd);
    };
  }, [gl, setQualityTier]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyT") return;
      if (!(window as unknown as { __presencaXr?: boolean }).__presencaXr) {
        // também permite teleport no desktop para testar navmesh
      }
      if (!getNavMesh()) return;
      const pos = playerPos.current;
      const yaw = playerYaw.current;
      const tx = pos.x - Math.sin(yaw) * 2.4;
      const tz = pos.z - Math.cos(yaw) * 2.4;
      const snap = snapToNavMesh(tx, tz) ?? { x: tx, z: tz };
      setNavDestination(pos.x, pos.z, snap.x, snap.z);
      void findPath; // keep import used if tree-shaken
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playerPos]);

  return null;
}

export function XrEnterButton() {
  const [supported, setSupported] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const xr = (
      navigator as Navigator & { xr?: { isSessionSupported: (m: string) => Promise<boolean> } }
    ).xr;
    void xr
      ?.isSessionSupported("immersive-vr")
      .then((s) => setSupported(!!s))
      .catch(() => setSupported(false));
  }, []);

  async function enter() {
    try {
      const xr = (
        navigator as Navigator & {
          xr?: { requestSession: (m: string, init?: object) => Promise<XRSession> };
        }
      ).xr;
      if (!xr) {
        setMsg("WebXR indisponível.");
        return;
      }
      const session = await xr.requestSession("immersive-vr", {
        optionalFeatures: ["local-floor", "bounded-floor"],
      });
      const gl = (window as unknown as { __presencaGl?: THREE.WebGLRenderer }).__presencaGl;
      if (!gl?.xr) {
        setMsg("Abra o Mundo 3D primeiro.");
        await session.end();
        return;
      }
      await gl.xr.setSession(session);
      usePresence.getState().setQualityTier("low");
      setMsg(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha VR");
    }
  }

  if (!supported) return null;
  return (
    <div className="pointer-events-auto absolute bottom-24 right-3 z-20 flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void enter()}
        className="rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-lg"
      >
        Entrar em VR
      </button>
      <p className="text-[10px] text-faint">Teleport: tecla T (navmesh)</p>
      {msg && <p className="max-w-[12rem] text-right text-[10px] text-rose-300/90">{msg}</p>}
    </div>
  );
}
