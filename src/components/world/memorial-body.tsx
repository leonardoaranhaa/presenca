import { Suspense, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { GLTF_LOADER_OPTS } from "@/lib/asset-pipeline";
import type { Persona } from "@/lib/types";
import { AVATAR_HUES } from "@/lib/types";
import { onSensationEvent, type SensationEvent } from "@/lib/sensation";
import { isWorldPointShown } from "./frustum-guard";
import { lodLevelAt } from "./lod";
import { getSpeechVisual } from "@/lib/speech-visual";
import { GlbErrorBoundary } from "./glb-fallback";
import { geoCapsule, geoSphere } from "./shared-geometries";
import { gestureAnchor } from "./gesture-vfx";
import {
  emptyGlbGesture,
  gestureEnvelope,
  motionFromGesture,
  GESTURE_DEFAULT_MS,
  type GlbGestureState,
} from "./glb-gesture";

/**
 * Avatar GLB de memorial/vivo NPC.
 * Gestos (abraço, mão, ombro, facial) → motion procedural + glow.
 * Se o GLB falhar → silhueta cápsula com o mesmo motion.
 */
export function MemorialBody({
  persona,
  livePos,
  liveYaw,
  gesturePose,
}: {
  persona: Persona;
  livePos: MutableRefObject<THREE.Vector3>;
  liveYaw: MutableRefObject<number>;
  /** Pose partilhada com WalkingNpc; se omitida, subscreve eventos localmente */
  gesturePose?: MutableRefObject<{
    gesture: import("@/lib/sensation").SensationGesture | null;
    amount: number;
    until: number;
    armOpen?: number;
    holdBias?: number;
  }>;
}) {
  const localPose = useRef<GlbGestureState>(emptyGlbGesture());
  // partilha ref do WalkingNpc quando existe
  const pose = (gesturePose as MutableRefObject<GlbGestureState> | undefined) ?? localPose;

  useEffect(() => {
    if (gesturePose) return;
    return onSensationEvent((e: SensationEvent | null) => {
      if (!e || e.personaId !== persona.id) return;
      if (e.gesture === "presence") return;
      pose.current = {
        gesture: e.gesture,
        amount: 0,
        until: performance.now() + (e.durationMs || GESTURE_DEFAULT_MS[e.gesture] || 800),
        armOpen: e.armOpen ?? 0.85,
        holdBias: e.holdBias ?? 0.55,
      };
    });
  }, [persona.id, gesturePose, pose]);

  const url = persona.bodyScan?.glbUrl?.trim();
  if (!url) {
    return (
      <CapsuleSilhouette persona={persona} livePos={livePos} liveYaw={liveYaw} gesturePose={pose} />
    );
  }

  return (
    <GlbErrorBoundary
      label={`memorial:${persona.id}`}
      fallback={
        <CapsuleSilhouette
          persona={persona}
          livePos={livePos}
          liveYaw={liveYaw}
          gesturePose={pose}
        />
      }
    >
      <Suspense
        fallback={
          <CapsuleSilhouette
            persona={persona}
            livePos={livePos}
            liveYaw={liveYaw}
            gesturePose={pose}
          />
        }
      >
        <MemorialGlb
          url={url}
          heightM={persona.bodyScan?.heightM ?? 1.7}
          personaId={persona.id}
          livePos={livePos}
          liveYaw={liveYaw}
          gesturePose={pose}
        />
      </Suspense>
    </GlbErrorBoundary>
  );
}

/**
 * Estado do gesto neste instante.
 *
 * Não é um hook — não chama nenhum e lê só a ref. Chamava-se
 * `useGestureAmount`, e o prefixo fazia o React tratá-la como hook: chamá-la
 * dentro de `useFrame` era uma violação das regras dos hooks, sinalizada como
 * erro. O nome é que estava errado.
 */
function gestureAmountFrom(pose: MutableRefObject<GlbGestureState>) {
  const g = pose.current;
  if (!g.gesture || performance.now() >= g.until) {
    g.amount = 0;
    g.gesture = null;
    return { gesture: null, amount: 0 };
  }
  const dur = GESTURE_DEFAULT_MS[g.gesture] || 1000;
  g.amount = gestureEnvelope(performance.now(), g.until, dur);
  return { gesture: g.gesture, amount: g.amount };
}

/** Cápsula alinhada ao agente + motion de gesto. */
export function CapsuleSilhouette({
  persona,
  livePos,
  liveYaw,
  gesturePose,
}: {
  persona: Persona;
  livePos: MutableRefObject<THREE.Vector3>;
  liveYaw: MutableRefObject<number>;
  gesturePose?: MutableRefObject<GlbGestureState>;
}) {
  const group = useRef<THREE.Group>(null);
  const glow = useRef<THREE.Mesh>(null);
  const localPose = useRef<GlbGestureState>(emptyGlbGesture());
  const pose = gesturePose ?? localPose;
  const palette = AVATAR_HUES[persona.hue] ?? AVATAR_HUES.dusk;
  const body = palette.cloth;
  const skin = palette.skin;
  const memorial = persona.kind === "memorial";

  useFrame(() => {
    if (!group.current) return;
    const x = livePos.current.x;
    const z = livePos.current.z;
    if (!isWorldPointShown(x, 1.0, z, 1.4, 1.2, persona.id)) {
      group.current.visible = false;
      return;
    }
    group.current.visible = true;
    const { gesture, amount } = gestureAmountFrom(pose);
    const m = motionFromGesture(gesture, amount);
    group.current.position.set(x, m.y, z);
    group.current.rotation.y = liveYaw.current;
    group.current.rotation.x = m.pitch;
    group.current.scale.set(m.scaleXZ, m.scaleY, m.scaleXZ);
    if (amount > 0.05) {
      gestureAnchor.x = x;
      gestureAnchor.z = z;
    }
    if (glow.current) {
      const mat = glow.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.35 * m.glow;
      glow.current.visible = m.glow > 0.05;
      glow.current.scale.setScalar(1 + m.glow * 0.4);
    }
  });

  return (
    <group ref={group}>
      <mesh position={[0, 0.72, 0]} geometry={geoCapsule()} castShadow>
        <meshStandardMaterial
          color={body}
          roughness={0.75}
          emissive={memorial ? "#3a4a5c" : "#000000"}
          emissiveIntensity={memorial ? 0.08 : 0}
        />
      </mesh>
      <mesh position={[0, 1.38, 0]} geometry={geoSphere()}>
        <meshStandardMaterial color={skin} roughness={0.55} />
      </mesh>
      <mesh ref={glow} position={[0, 1.05, 0.15]} visible={false}>
        <sphereGeometry args={[0.28, 12, 12]} />
        <meshBasicMaterial color="#c47a8a" transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function MemorialGlb({
  url,
  heightM,
  personaId,
  livePos,
  liveYaw,
  gesturePose,
}: {
  url: string;
  heightM: number;
  personaId: string;
  livePos: MutableRefObject<THREE.Vector3>;
  liveYaw: MutableRefObject<number>;
  gesturePose: MutableRefObject<GlbGestureState>;
}) {
  const gltf = useGLTF(url, GLTF_LOADER_OPTS.useDraco, GLTF_LOADER_OPTS.useMeshopt);
  const root = useRef<THREE.Group>(null);
  const glow = useRef<THREE.Mesh>(null);

  const scene = useMemo(() => {
    if (!gltf?.scene) {
      throw new Error("GLB sem cena");
    }
    const s = gltf.scene.clone(true);
    s.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(s);
    const size = new THREE.Vector3();
    box.getSize(size);
    if (size.y < 0.05 && size.x < 0.05) {
      throw new Error("GLB vazio ou inválido");
    }
    const scale = size.y > 0.01 ? heightM / size.y : 1;
    s.scale.setScalar(scale);
    s.position.y = -box.min.y * scale;
    s.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const m = o as THREE.Mesh;
        m.castShadow = true;
        m.frustumCulled = true;
      }
    });
    return s;
  }, [gltf.scene, heightM]);

  useFrame(({ clock }) => {
    if (!root.current) return;
    const x = livePos.current.x;
    const z = livePos.current.z;
    if (!isWorldPointShown(x, 1.0, z, 1.4, 1.2, personaId)) {
      root.current.visible = false;
      return;
    }
    root.current.visible = true;

    const { gesture, amount } = gestureAmountFrom(gesturePose);
    const motion = motionFromGesture(gesture, amount);

    root.current.position.x = x;
    root.current.position.z = z;
    root.current.position.y = motion.y;
    root.current.rotation.y = liveYaw.current;
    root.current.rotation.x = motion.pitch;

    if (amount > 0.05) {
      gestureAnchor.x = x;
      gestureAnchor.z = z;
    }

    const lod = lodLevelAt(x, z);
    const sv = getSpeechVisual();
    const talking =
      sv.personaId === personaId && performance.now() < sv.until
        ? sv.intensity * (0.5 + 0.5 * Math.abs(Math.sin(clock.elapsedTime * 11)))
        : 0;

    if (lod >= 2) {
      root.current.scale.set(motion.scaleXZ, motion.scaleY, motion.scaleXZ);
    } else {
      const bobX = motion.scaleXZ * (1 + talking * 0.02);
      const bobY = motion.scaleY * (1 + talking * 0.03);
      root.current.scale.set(bobX, bobY, bobX);
    }

    if (glow.current) {
      const mat = glow.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.4 * motion.glow;
      glow.current.visible = motion.glow > 0.05;
      glow.current.scale.setScalar(0.9 + motion.glow * 0.5);
    }
  });

  return (
    <group ref={root}>
      <primitive object={scene} />
      {/* halo peito — abraço / toque sem bones */}
      <mesh ref={glow} position={[0, heightM * 0.62, 0.2]} visible={false}>
        <sphereGeometry args={[0.22, 14, 14]} />
        <meshBasicMaterial color="#c47a8a" transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function preloadMemorialAvatar(url: string) {
  if (url) {
    try {
      useGLTF.preload(url);
    } catch {
      /* preload best-effort */
    }
  }
}
