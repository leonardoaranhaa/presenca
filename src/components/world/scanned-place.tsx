import { Suspense, useEffect, useMemo, useState } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { GLTF_LOADER_OPTS } from "@/lib/asset-pipeline";
import type { PlaceScan } from "@/lib/places";
import type { RoomMetrics } from "@/lib/room-metrics";
import { DEFAULT_METRICS } from "@/lib/room-metrics";
import { setScanCollision } from "./collision";
import { extractScanCollision, extractScanOccluders } from "./scan-collision";
import { setScanOccluders, clearScanOccluders } from "./collision";
import { computeScanScale, groundAndCenter } from "./scan-scale";
import { SimpleRoom } from "./simple-room";
import { GlbErrorBoundary } from "./glb-fallback";

type Props = {
  scan?: PlaceScan;
  metrics?: RoomMetrics;
  /** Override manual; se omitido, escala automática por bbox */
  scale?: number;
  /** Altura de porta alvo (m) para auto-scale */
  doorHeightM?: number;
};

/**
 * Fotogrametria: auto-escala + chão + colisão/navmesh (grelha).
 */
export function ScannedPlace({ scan, metrics, scale: scaleProp, doorHeightM = 2.15 }: Props) {
  const url = scan?.glbUrl?.trim();
  if (!url) {
    return <SimpleRoom metrics={metrics ?? DEFAULT_METRICS} />;
  }
  const roomFallback = <SimpleRoom metrics={metrics ?? DEFAULT_METRICS} />;
  return (
    <GlbErrorBoundary label="scan-place" fallback={roomFallback} notify>
      <Suspense fallback={roomFallback}>
        <ScannedGlb
          url={url}
          colliderUrl={scan?.colliderUrl}
          scaleProp={scaleProp}
          doorHeightM={doorHeightM}
        />
      </Suspense>
    </GlbErrorBoundary>
  );
}

function ScannedGlb({
  url,
  colliderUrl,
  scaleProp,
  doorHeightM,
}: {
  url: string;
  colliderUrl?: string;
  scaleProp?: number;
  doorHeightM: number;
}) {
  const gltf = useGLTF(url, GLTF_LOADER_OPTS.useDraco, GLTF_LOADER_OPTS.useMeshopt);
  const [info, setInfo] = useState<string>("");

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
    // escala 1 primeiro para medir
    root.scale.setScalar(1);
    root.position.set(0, 0, 0);
    root.updateMatrixWorld(true);
    const { scale, reason } = computeScanScale(root, {
      doorHeightM,
      manual: scaleProp,
    });
    root.scale.setScalar(scaleProp && scaleProp > 0 ? scaleProp : scale);
    root.updateMatrixWorld(true);
    groundAndCenter(root);
    queueMicrotask(() => setInfo(reason + ` scale=${(scaleProp ?? scale).toFixed(3)}`));
    return root;
  }, [gltf.scene, scaleProp, doorHeightM]);

  useEffect(() => {
    if (colliderUrl) return;
    const config = extractScanCollision(scene, {
      buildGrid: true,
      cellSize: 0.35,
      wallInset: 0.3,
      agentRadius: 0.28,
    });
    setScanCollision(config);
    setScanOccluders(
      extractScanOccluders(scene, {
        includeWallOccluders: true,
        maxBlockFractionOfFloor: 0.7,
      }),
    );
    if (typeof window !== "undefined") {
      (window as unknown as { __scanCollision?: unknown }).__scanCollision = {
        bounds: config.bounds,
        blocks: config.blocks?.length ?? 0,
        grid: config.grid
          ? { cols: config.grid.cols, rows: config.grid.rows, cellSize: config.grid.cellSize }
          : null,
        scaleInfo: info,
      };
    }
  }, [scene, colliderUrl, info]);

  return (
    <group>
      <primitive object={scene} />
      {colliderUrl ? (
        <Suspense fallback={null}>
          <ColliderGlb url={colliderUrl} scaleProp={scaleProp} doorHeightM={doorHeightM} />
        </Suspense>
      ) : null}
    </group>
  );
}

function ColliderGlb({
  url,
  scaleProp,
  doorHeightM,
}: {
  url: string;
  scaleProp?: number;
  doorHeightM: number;
}) {
  const gltf = useGLTF(url, GLTF_LOADER_OPTS.useDraco, GLTF_LOADER_OPTS.useMeshopt);
  const root = useMemo(() => {
    const r = gltf.scene.clone(true);
    r.scale.setScalar(1);
    r.updateMatrixWorld(true);
    const { scale } = computeScanScale(r, { doorHeightM, manual: scaleProp });
    r.scale.setScalar(scaleProp && scaleProp > 0 ? scaleProp : scale);
    groundAndCenter(r);
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
  }, [gltf.scene, scaleProp, doorHeightM]);

  useEffect(() => {
    const config = extractScanCollision(root, {
      buildGrid: true,
      cellSize: 0.3,
      wallInset: 0.15,
      agentRadius: 0.28,
      minBlockHeight: 0.25,
      minBlockArea: 0.08,
      maxBlockFractionOfFloor: 0.55,
      includeWallOccluders: true,
    });
    setScanCollision(config);
    const occluders = extractScanOccluders(root, {
      minBlockHeight: 0.25,
      minBlockArea: 0.08,
      maxBlockFractionOfFloor: 0.7,
      includeWallOccluders: true,
    });
    setScanOccluders(occluders);
    return () => clearScanOccluders();
  }, [root]);

  return <primitive object={root} />;
}

export function preloadScan(url: string) {
  if (url) useGLTF.preload(url);
}
