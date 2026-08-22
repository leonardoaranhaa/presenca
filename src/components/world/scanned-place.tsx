import { Suspense, useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { PlaceScan } from "@/lib/places";
import type { RoomMetrics } from "@/lib/room-metrics";
import { DEFAULT_METRICS } from "@/lib/room-metrics";
import { setScanCollision } from "./collision";
import { extractScanCollision } from "./scan-collision";
import { SimpleRoom } from "./simple-room";

type Props = {
  scan?: PlaceScan;
  metrics?: RoomMetrics;
  scale?: number;
};

/**
 * Lugar de fotogrametria.
 * Ao carregar o GLB, extrai bounds + blocos + grelha e regista em setScanCollision.
 */
export function ScannedPlace({ scan, metrics, scale = 1 }: Props) {
  const url = scan?.glbUrl?.trim();
  if (!url) {
    return <SimpleRoom metrics={metrics ?? DEFAULT_METRICS} />;
  }
  return (
    <Suspense fallback={<SimpleRoom metrics={metrics ?? DEFAULT_METRICS} />}>
      <ScannedGlb
        url={url}
        colliderUrl={scan?.colliderUrl}
        scale={scale}
      />
    </Suspense>
  );
}

function ScannedGlb({
  url,
  colliderUrl,
  scale,
}: {
  url: string;
  colliderUrl?: string;
  scale: number;
}) {
  const gltf = useGLTF(url);
  const scene = useMemo(() => {
    const root = gltf.scene.clone(true);
    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = true;
      }
    });
    root.scale.setScalar(scale);
    root.updateMatrixWorld(true);
    return root;
  }, [gltf.scene, scale]);

  // Colisão a partir do mesh visual (ou collider dedicado quando carregar)
  useEffect(() => {
    if (colliderUrl) return; // InvisibleCollider trata
    const config = extractScanCollision(scene, {
      buildGrid: true,
      cellSize: 0.35,
      wallInset: 0.3,
      agentRadius: 0.28,
    });
    setScanCollision(config);
    if (typeof window !== "undefined") {
      (window as unknown as { __scanCollision?: unknown }).__scanCollision = {
        bounds: config.bounds,
        blocks: config.blocks?.length ?? 0,
        grid: config.grid
          ? { cols: config.grid.cols, rows: config.grid.rows, cellSize: config.grid.cellSize }
          : null,
      };
    }
  }, [scene, colliderUrl]);

  return (
    <group>
      <primitive object={scene} />
      {colliderUrl ? (
        <Suspense fallback={null}>
          <ColliderGlb url={colliderUrl} scale={scale} />
        </Suspense>
      ) : null}
    </group>
  );
}

/** GLB low-poly só para colisão — preferível ao mesh visual denso. */
function ColliderGlb({ url, scale }: { url: string; scale: number }) {
  const gltf = useGLTF(url);
  const root = useMemo(() => {
    const r = gltf.scene.clone(true);
    r.scale.setScalar(scale);
    r.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.visible = false;
        mesh.material = new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthWrite: false,
        });
      }
    });
    r.updateMatrixWorld(true);
    return r;
  }, [gltf.scene, scale]);

  useEffect(() => {
    const config = extractScanCollision(root, {
      buildGrid: true,
      cellSize: 0.3,
      wallInset: 0.15,
      agentRadius: 0.28,
      // collider já é limpo: aceita blocos menores
      minBlockHeight: 0.25,
      minBlockArea: 0.08,
      maxBlockFractionOfFloor: 0.55,
    });
    setScanCollision(config);
  }, [root]);

  return <primitive object={root} />;
}

export function preloadScan(url: string) {
  if (url) useGLTF.preload(url);
}
