import { Component, Suspense, useMemo, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { Center, Environment, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { formatAvatarError, avatarError } from "@/lib/avatar-errors";

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return c;
  }, [scene]);
  return (
    <Center>
      <primitive object={cloned} />
    </Center>
  );
}

class GlbErrorBoundary extends Component<
  { children: ReactNode; onError?: (msg: string) => void },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(e: unknown) {
    const msg = e instanceof Error ? e.message : "Falha ao carregar o modelo.";
    return { error: msg };
  }

  componentDidCatch(e: unknown) {
    const formatted = formatAvatarError(
      avatarError("glb_load", e instanceof Error ? e.message : "GLB inválido ou inacessível."),
    );
    this.props.onError?.(formatted.detail);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-56 flex-col items-center justify-center gap-1 rounded-lg bg-surface-2 px-4 text-center">
          <p className="text-sm text-foreground">GLB não carregou</p>
          <p className="text-xs text-muted">{this.state.error}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Preview orbitável de um GLB antes de entrar no mundo.
 */
export function GlbPreview({ url, heightM = 1.7 }: { url: string; heightM?: number }) {
  const trimmed = url.trim();
  if (!trimmed) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg bg-surface-2 text-xs text-faint">
        Sem GLB para pré-visualizar
      </div>
    );
  }

  return (
    <GlbErrorBoundary>
      <div className="relative h-56 w-full overflow-hidden rounded-lg bg-[#12161c]">
        <Canvas
          camera={{ position: [0, heightM * 0.55, heightM * 1.8], fov: 35 }}
          dpr={[1, 1.5]}
          onCreated={({ gl }) => {
            gl.setClearColor("#12161c");
          }}
        >
          <color attach="background" args={["#12161c"]} />
          <ambientLight intensity={0.55} />
          <directionalLight position={[2, 4, 2]} intensity={1.1} castShadow />
          <Suspense
            fallback={
              <mesh>
                <boxGeometry args={[0.3, 0.3, 0.3]} />
                <meshBasicMaterial color="#3a4555" wireframe />
              </mesh>
            }
          >
            <Model url={trimmed} />
            <Environment preset="apartment" />
          </Suspense>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
            <circleGeometry args={[1.2, 48]} />
            <meshStandardMaterial color="#1a222c" roughness={0.9} />
          </mesh>
          <OrbitControls
            makeDefault
            enablePan={false}
            minDistance={1.2}
            maxDistance={5}
            target={[0, heightM * 0.45, 0]}
          />
        </Canvas>
        <p className="pointer-events-none absolute bottom-2 left-2 text-[10px] text-faint">
          Arraste para orbitar
        </p>
      </div>
    </GlbErrorBoundary>
  );
}
