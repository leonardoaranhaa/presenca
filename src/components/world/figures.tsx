import { Suspense, useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { GLTF_LOADER_OPTS } from "@/lib/asset-pipeline";
import { Rotulo3D } from "./rotulo-3d";
import { usePresence } from "@/lib/store";
import { AVATAR_HUES, ROOM_SPAWNS, type Persona } from "@/lib/types";
import type { PeerPose } from "@/lib/realtime";
import { onSensationEvent, type SensationEvent, type SensationGesture } from "@/lib/sensation";
import { geoCapsule, geoSphere, geoSphereSm } from "./shared-geometries";
import { ensureNpcAgent, getNavMesh, setNpcDestination, stepNpcAgent } from "./navmesh";
import { PlayerBody } from "./player-avatar";
import { MemorialBody, preloadMemorialAvatar } from "./memorial-body";
import { GlbErrorBoundary } from "./glb-fallback";
import { setTalkLookTarget } from "./look-target";
import { isWorldPointShown } from "./frustum-guard";
import { lodLevelAt } from "./lod";
import { getSpeechVisual } from "@/lib/speech-visual";
import { Sensation } from "@/lib/sensation";

const NPC_SPEED = 1.15;
const APPROACH_RANGE = 9;
const COMFORT_DIST = 1.55;
const REPATH_MS = 1800;

/** Pose de gesto no corpo (0 = repouso, 1 = pico do gesto). */
type GesturePose = {
  gesture: SensationGesture | null;
  /** 0–1 envelope */
  amount: number;
  until: number;
  armOpen: number;
  holdBias: number;
  hugStyle?: string;
  facialSide?: "left" | "right" | "both";
};

function emptyGesture(): GesturePose {
  return { gesture: null, amount: 0, until: 0, armOpen: 0.85, holdBias: 0.55, facialSide: "right" };
}

export function Figure({
  persona,
  isPlayer,
  position,
  yaw,
  livePos,
  liveYaw,
  talking,
  onSelect,
  gesturePose,
  nearest,
}: {
  persona: Persona;
  isPlayer?: boolean;
  position: [number, number, number];
  yaw: number;
  livePos?: THREE.Vector3;
  liveYaw?: RefObject<number>;
  talking?: boolean;
  onSelect?: () => void;
  gesturePose?: RefObject<GesturePose>;
  /** anel no chão — presença mais próxima / em conversa */
  nearest?: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const jawMesh = useRef<THREE.Mesh>(null);
  const chest = useRef<THREE.Mesh>(null);
  const leftCheek = useRef<THREE.Mesh>(null);
  const rightCheek = useRef<THREE.Mesh>(null);
  const forehead = useRef<THREE.Mesh>(null);
  const palette = AVATAR_HUES[persona.hue];
  const memorial = persona.kind === "memorial";
  const cast = usePresence((s) => s.getQuality().castShadowsOnFigures);

  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.elapsedTime;
    // Frustum: saltar animação fina se fora de vista (excepto player)
    if (!isPlayer) {
      const wx = group.current.position.x;
      const wz = group.current.position.z;
      if (!isWorldPointShown(wx, 1.0, wz, 1.4, 1.2, persona.id)) {
        group.current.visible = false;
        return;
      }
      group.current.visible = true;
    }
    const lod = isPlayer ? 0 : lodLevelAt(group.current.position.x, group.current.position.z);
    const breath = Math.sin(t * (talking ? 3.2 : 1.6) + persona.name.length) * 0.015;
    const sv = getSpeechVisual();
    const speechOpen =
      sv.personaId === persona.id && performance.now() < sv.until
        ? sv.intensity * (0.55 + 0.45 * Math.abs(Math.sin(t * 12)))
        : talking
          ? 0.25 + 0.2 * Math.abs(Math.sin(t * 10))
          : 0;

    if (isPlayer && livePos && liveYaw) {
      group.current.position.set(livePos.x, breath, livePos.z);
      group.current.rotation.y = liveYaw.current + Math.PI;
    } else if (livePos) {
      group.current.position.set(livePos.x, breath, livePos.z);
      group.current.rotation.y = (liveYaw?.current ?? yaw) + Math.PI;
    } else {
      group.current.position.y = breath;
      group.current.rotation.y = yaw + Math.sin(t * 0.4) * 0.08;
    }

    // Envelope do gesto
    let gAmt = 0;
    let gType: SensationGesture | null = null;
    if (gesturePose?.current) {
      const g = gesturePose.current;
      const now = performance.now();
      if (g.gesture && now < g.until) {
        const phaseDur = Math.max(400, GESTURE_MS[g.gesture] || 800);
        const start = g.until - phaseDur;
        const e = Math.max(0, Math.min(1, (now - start) / phaseDur));
        gType = g.gesture;
        if (e < 0.18) gAmt = e / 0.18;
        else if (e < 0.65) gAmt = 1;
        else gAmt = Math.max(0, 1 - (e - 0.65) / 0.35);
        g.amount = gAmt;
      } else {
        g.gesture = null;
        g.amount = 0;
      }
    }

    if (jawMesh.current) {
      if (lod >= 2) {
        jawMesh.current.visible = false;
      } else {
        jawMesh.current.visible = true;
        jawMesh.current.scale.set(1, 1 + speechOpen * 0.55, 1 + speechOpen * 0.2);
        jawMesh.current.position.y = 1.22 - speechOpen * 0.04;
      }
    }

    // Braços (LOD 2: repouso, sem gestos finos)
    if (leftArm.current && rightArm.current) {
      if (lod >= 2) {
        leftArm.current.rotation.set(0.12, 0.15, 0);
        rightArm.current.rotation.set(-0.12, -0.15, 0);
        leftArm.current.visible = true;
        rightArm.current.visible = true;
        // still update chest briefly below
      } else {
        // repouso: braços ao longo do corpo
        let lX = 0.12;
        let rX = -0.12;
        let lZ = 0;
        let rZ = 0;
        let lRY = 0.15;
        let rRY = -0.15;
        if (gType === "hug" && gAmt > 0) {
          const open = gesturePose?.current?.armOpen ?? 0.85;
          const hold = gesturePose?.current?.holdBias ?? 0.55;
          // gAmt sobe, segura conforme holdBias, desce
          const squeeze = gAmt * (0.7 + 0.3 * hold);
          lX = 0.12 + 0.55 * open * squeeze;
          rX = -0.12 - 0.55 * open * squeeze;
          lZ = 0.35 * open * squeeze;
          rZ = 0.35 * open * squeeze;
          lRY = 0.15 - 0.9 * open * squeeze;
          rRY = -0.15 + 0.9 * open * squeeze;
        } else if (gType === "hand" && gAmt > 0) {
          rX = -0.12 - 0.2 * gAmt;
          rZ = 0.45 * gAmt;
          rRY = -0.15 + 1.1 * gAmt;
        } else if (gType === "shoulder" && gAmt > 0) {
          rX = -0.12 - 0.35 * gAmt;
          rZ = 0.25 * gAmt;
          rRY = -0.15 + 0.7 * gAmt;
        } else if (gType === "farewell" && gAmt > 0) {
          rZ = 0.2 * gAmt;
          rRY = -0.15 + 0.5 * gAmt;
        }
        leftArm.current.rotation.set(lX, lRY, lZ);
        rightArm.current.rotation.set(rX, rRY, rZ);
      } // end lod < 2 arms
    }

    // Peito: batimento / abraço (emissive + scale)
    if (chest.current) {
      const mat = chest.current.material as THREE.MeshStandardMaterial;
      if (gType === "heartbeat" && gAmt > 0) {
        const beat = 0.5 + 0.5 * Math.sin(t * 8);
        chest.current.scale.setScalar(1 + 0.04 * gAmt * beat);
        mat.emissiveIntensity = memorial ? 0.08 + 0.25 * gAmt * beat : 0.15 * gAmt * beat;
      } else if (gType === "hug" && gAmt > 0) {
        chest.current.scale.setScalar(1 + 0.03 * gAmt);
        mat.emissiveIntensity = memorial ? 0.08 + 0.12 * gAmt : 0.1 * gAmt;
      } else {
        chest.current.scale.setScalar(1);
        mat.emissiveIntensity = memorial ? 0.08 : 0;
      }
    }

    // Háptica facial → brilho local no rosto
    const faceGestures = [
      "cheek_kiss",
      "forehead_touch",
      "cheek_caress",
      "temple_press",
      "nose_boop",
      "farewell_cheek",
    ];
    if (gType && faceGestures.includes(gType) && gAmt > 0) {
      const side = gesturePose?.current?.facialSide ?? "right";
      const glow = 0.35 + 0.65 * gAmt;
      if (leftCheek.current) {
        const m = leftCheek.current.material as THREE.MeshBasicMaterial;
        const on =
          gType === "forehead_touch" || gType === "nose_boop"
            ? 0.15 * gAmt
            : side !== "right"
              ? glow
              : 0.05 * gAmt;
        m.opacity = on;
        leftCheek.current.visible = on > 0.05;
      }
      if (rightCheek.current) {
        const m = rightCheek.current.material as THREE.MeshBasicMaterial;
        const on =
          gType === "forehead_touch" || gType === "nose_boop"
            ? 0.15 * gAmt
            : side !== "left"
              ? glow
              : 0.05 * gAmt;
        m.opacity = on;
        rightCheek.current.visible = on > 0.05;
      }
      if (forehead.current) {
        const m = forehead.current.material as THREE.MeshBasicMaterial;
        const on = gType === "forehead_touch" || gType === "temple_press" ? glow * 0.8 : 0;
        m.opacity = on;
        forehead.current.visible = on > 0.05;
      }
    } else {
      if (leftCheek.current) leftCheek.current.visible = false;
      if (rightCheek.current) rightCheek.current.visible = false;
      if (forehead.current) forehead.current.visible = false;
    }
  });

  return (
    <group
      ref={group}
      position={position}
      rotation={[0, yaw, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
    >
      {nearest && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.42, 0.52, 32]} />
          <meshBasicMaterial
            color={memorial ? "#c4a882" : "#8a9a86"}
            transparent
            opacity={0.85}
            depthWrite={false}
          />
        </mesh>
      )}
      {/* torso */}
      <mesh ref={chest} position={[0, 0.72, 0]} geometry={geoCapsule()} castShadow={cast}>
        <meshStandardMaterial
          color={palette.cloth}
          roughness={0.7}
          emissive={memorial ? palette.cloth : "#000000"}
          emissiveIntensity={memorial ? 0.08 : 0}
        />
      </mesh>
      {/* braço esquerdo */}
      <group ref={leftArm} position={[-0.28, 1.05, 0]}>
        <mesh position={[0, -0.28, 0]} rotation={[0, 0, 0.1]} castShadow={cast}>
          <capsuleGeometry args={[0.07, 0.42, 4, 8]} />
          <meshStandardMaterial color={palette.cloth} roughness={0.75} />
        </mesh>
      </group>
      {/* braço direito */}
      <group ref={rightArm} position={[0.28, 1.05, 0]}>
        <mesh position={[0, -0.28, 0]} rotation={[0, 0, -0.1]} castShadow={cast}>
          <capsuleGeometry args={[0.07, 0.42, 4, 8]} />
          <meshStandardMaterial color={palette.cloth} roughness={0.75} />
        </mesh>
      </group>
      <mesh position={[0, 1.38, 0]} geometry={geoSphere()} castShadow={cast}>
        <meshStandardMaterial color={palette.skin} roughness={0.55} />
      </mesh>
      <mesh ref={jawMesh} position={[0, 1.22, 0.08]} scale={[0.55, 0.35, 0.45]}>
        <sphereGeometry args={[0.12, 10, 8]} />
        <meshStandardMaterial color="#c4a07a" roughness={0.6} />
      </mesh>
      <Hair hair={persona.hair} color={memorial ? "#3a342e" : "#2a241e"} />
      <mesh position={[-0.07, 1.42, 0.16]} geometry={geoSphereSm()}>
        <meshBasicMaterial color="#1a1612" />
      </mesh>
      <mesh position={[0.07, 1.42, 0.16]} geometry={geoSphereSm()}>
        <meshBasicMaterial color="#1a1612" />
      </mesh>
      {/* marcas faciais hápticas */}
      <mesh ref={leftCheek} position={[-0.14, 1.32, 0.18]} visible={false}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial color="#e8b4a0" transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh ref={rightCheek} position={[0.14, 1.32, 0.18]} visible={false}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial color="#e8b4a0" transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh ref={forehead} position={[0, 1.5, 0.16]} visible={false}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshBasicMaterial color="#d5c4b0" transparent opacity={0} depthWrite={false} />
      </mesh>
      {!isPlayer && (
        <mesh position={[0, 1.82, 0]}>
          <sphereGeometry args={[0.045, 8, 8]} />
          <meshBasicMaterial color={memorial ? "#c5c1b7" : "#8a9a86"} />
        </mesh>
      )}
    </group>
  );
}

const GESTURE_MS: Partial<Record<SensationGesture, number>> = {
  presence: 400,
  hand: 600,
  shoulder: 800,
  hug: 1400,
  heartbeat: 2000,
  farewell: 700,
  cheek_kiss: 420,
  forehead_touch: 800,
  cheek_caress: 900,
  temple_press: 1000,
  nose_boop: 280,
  farewell_cheek: 550,
};

function Hair({ hair, color }: { hair: Persona["hair"]; color: string }) {
  if (hair === "bald") {
    return (
      <mesh position={[0, 1.5, 0]}>
        <sphereGeometry args={[0.12, 10, 8]} />
        <meshStandardMaterial color="#c4b8a5" roughness={0.7} />
      </mesh>
    );
  }
  if (hair === "bun") {
    return (
      <group>
        <mesh position={[0, 1.52, -0.02]}>
          <sphereGeometry args={[0.21, 12, 10]} />
          <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
        <mesh position={[0, 1.68, -0.08]}>
          <sphereGeometry args={[0.1, 10, 8]} />
          <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
      </group>
    );
  }
  if (hair === "long") {
    return (
      <mesh position={[0, 1.28, -0.06]}>
        <capsuleGeometry args={[0.2, 0.45, 6, 10]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
    );
  }
  if (hair === "wavy") {
    return (
      <mesh position={[0, 1.5, 0]}>
        <sphereGeometry args={[0.23, 12, 10]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
    );
  }
  return (
    <mesh position={[0, 1.5, 0.02]}>
      <sphereGeometry args={[0.21, 12, 10]} />
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
  );
}

/**
 * Corpos das outras pessoas ligadas ao mesmo lugar.
 *
 * O nome era um comentário ("nome flutuante simplificado") sobre uma esfera de
 * 3 cm: não havia nome nenhum. Num lar partilhado saber quem está à frente é
 * metade do ponto, por isso passa a ser texto real virado para a câmara.
 */
function PeerGlbBody({ url, heightM = 1.7 }: { url: string; heightM?: number }) {
  const { scene } = useGLTF(url, GLTF_LOADER_OPTS.useDraco, GLTF_LOADER_OPTS.useMeshopt);
  const cloned = useMemo(() => {
    const c = scene.clone(true);
    const box = new THREE.Box3().setFromObject(c);
    const size = new THREE.Vector3();
    box.getSize(size);
    const s = size.y > 0.01 ? heightM / size.y : 1;
    c.scale.setScalar(s);
    c.position.y = -box.min.y * s;
    c.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
      }
    });
    return c;
  }, [scene, heightM]);
  return <primitive object={cloned} />;
}

function peerColor(peer: PeerPose): string {
  if (typeof peer.hue === "number") {
    return `hsl(${peer.hue % 360} 32% 42%)`;
  }
  let h = 0;
  for (let i = 0; i < (peer.displayName || "").length; i++) {
    h = (h * 31 + peer.displayName.charCodeAt(i)) % 360;
  }
  return `hsl(${h} 28% 40%)`;
}

function PeerAvatar({ peer }: { peer: PeerPose }) {
  const group = useRef<THREE.Group>(null);
  const label = useRef<THREE.Group>(null);
  const target = useRef({ x: peer.x, z: peer.z, yaw: peer.yaw });
  const prev = useRef({ x: peer.x, z: peer.z });
  const speed = useRef(0);
  const phase = useRef(0);
  target.current = { x: peer.x, z: peer.z, yaw: peer.yaw };

  useFrame((_, dt) => {
    if (!group.current) return;
    const tx = target.current.x;
    const tz = target.current.z;
    if (!isWorldPointShown(tx, 1.0, tz, 1.3, 1.5, peer.peerId)) {
      group.current.visible = false;
      if (label.current) label.current.visible = false;
      // ainda interpola um pouco para não saltar ao reentrar
      const kSlow = 1 - Math.exp(-3 * Math.min(dt, 0.1));
      group.current.position.x += (tx - group.current.position.x) * kSlow;
      group.current.position.z += (tz - group.current.position.z) * kSlow;
      return;
    }
    group.current.visible = true;
    const peerLod = lodLevelAt(tx, tz);
    if (label.current) label.current.visible = peerLod < 2;
    const k = 1 - Math.exp(-10 * Math.min(dt, 0.1));
    const gx = group.current.position.x;
    const gz = group.current.position.z;
    group.current.position.x += (target.current.x - gx) * k;
    group.current.position.z += (target.current.z - gz) * k;
    const dx = group.current.position.x - prev.current.x;
    const dz = group.current.position.z - prev.current.z;
    const dist = Math.hypot(dx, dz);
    speed.current = dist / Math.max(dt, 1e-4);
    prev.current.x = group.current.position.x;
    prev.current.z = group.current.position.z;
    // bob de caminhada
    if (speed.current > 0.4) {
      phase.current += dt * (6 + speed.current * 0.8);
      group.current.position.y = Math.abs(Math.sin(phase.current)) * 0.04;
    } else {
      group.current.position.y *= 0.85;
    }
    let dy = target.current.yaw - group.current.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    group.current.rotation.y += dy * k;
    if (label.current) {
      label.current.position.x = group.current.position.x;
      label.current.position.z = group.current.position.z;
    }
  });

  return (
    <group>
      <group ref={group} position={[peer.x, 0, peer.z]} rotation={[0, peer.yaw, 0]}>
        {peer.bodyGlbUrl || peer.glbUrl ? (
          <GlbErrorBoundary
            label={`peer:${peer.peerId}`}
            notify={false}
            fallback={
              <mesh position={[0, 0.72, 0]} geometry={geoCapsule()}>
                <meshStandardMaterial color={peerColor(peer)} roughness={0.7} />
              </mesh>
            }
          >
            <Suspense
              fallback={
                <mesh position={[0, 0.72, 0]} geometry={geoCapsule()}>
                  <meshStandardMaterial color={peerColor(peer)} />
                </mesh>
              }
            >
              <PeerGlbBody url={(peer.bodyGlbUrl || peer.glbUrl)!} heightM={peer.heightM ?? 1.7} />
            </Suspense>
          </GlbErrorBoundary>
        ) : (
          <>
            <mesh position={[0, 0.72, 0]} geometry={geoCapsule()}>
              <meshStandardMaterial color={peerColor(peer)} roughness={0.7} />
            </mesh>
            <mesh position={[0, 1.38, 0]} geometry={geoSphere()}>
              <meshStandardMaterial color="#c4a07a" roughness={0.55} />
            </mesh>
            <mesh position={[0, 1.85, 0]}>
              <sphereGeometry args={[0.05, 8, 8]} />
              <meshBasicMaterial color="#8a9a86" />
            </mesh>
          </>
        )}
      </group>
      <group ref={label} position={[peer.x, 0, peer.z]}>
        <Rotulo3D texto={peer.displayName || "Visitante"} position={[0, 2.12, 0]} />
      </group>
    </group>
  );
}

export function PeerFigures({ peers }: { peers: PeerPose[] }) {
  return (
    <>
      {peers.map((p) => (
        <PeerAvatar key={p.peerId} peer={p} />
      ))}
    </>
  );
}

function usePersonaGesture(personaId: string) {
  const pose = useRef<GesturePose>(emptyGesture());
  useEffect(() => {
    return onSensationEvent((e: SensationEvent | null) => {
      if (!e || e.personaId !== personaId) return;
      if (e.gesture === "presence") return;
      pose.current = {
        gesture: e.gesture,
        amount: 0,
        until: performance.now() + (e.durationMs || GESTURE_MS[e.gesture] || 800),
        armOpen: e.armOpen ?? 0.85,
        holdBias: e.holdBias ?? 0.55,
        hugStyle: e.hugStyle,
        facialSide: e.facialSide,
      };
    });
  }, [personaId]);
  return pose;
}

function WalkingNpc({
  persona,
  home,
  playerPos,
  talking,
  approach,
  onSelect,
  nearest,
}: {
  persona: Persona;
  home: { x: number; z: number };
  playerPos: THREE.Vector3;
  talking: boolean;
  approach: boolean;
  onSelect: () => void;
  nearest?: boolean;
}) {
  const livePos = useRef(new THREE.Vector3(home.x, 0, home.z));
  const liveYaw = useRef(0);
  const lastRepath = useRef(0);
  const lastWave = useRef(0);
  const gesturePose = usePersonaGesture(persona.id);

  useEffect(() => {
    ensureNpcAgent(persona.id, home.x, home.z);
  }, [persona.id, home.x, home.z]);

  useFrame((_, dt) => {
    const agent = ensureNpcAgent(persona.id, home.x, home.z);
    const clamped = Math.min(dt, 0.1);
    const now = performance.now();

    // Durante abraço, para de andar
    const hugging =
      gesturePose.current.gesture === "hug" && performance.now() < gesturePose.current.until;

    if (approach && getNavMesh() && !hugging) {
      const dist = Math.hypot(playerPos.x - agent.x, playerPos.z - agent.z);
      // Aceno ao aproximar (gesto visual + háptica se consentida)
      if (dist < 3.5 && dist > 1.5 && now - lastWave.current > 14_000 && !talking) {
        lastWave.current = now;
        void Sensation.offerHand(
          persona.id,
          persona.name,
          persona.kind === "memorial" ? "memorial" : "living",
        );
      }
      if (dist > COMFORT_DIST && dist < APPROACH_RANGE) {
        if (!agent.active || now - lastRepath.current > REPATH_MS) {
          const ang = Math.atan2(agent.x - playerPos.x, agent.z - playerPos.z);
          const tx = playerPos.x + Math.sin(ang) * COMFORT_DIST;
          const tz = playerPos.z + Math.cos(ang) * COMFORT_DIST;
          setNpcDestination(persona.id, tx, tz);
          lastRepath.current = now;
        }
      } else if (dist <= COMFORT_DIST) {
        agent.active = false;
        agent.path = [];
        agent.yaw = Math.atan2(-(playerPos.x - agent.x), -(playerPos.z - agent.z));
      }
    }

    const step = stepNpcAgent(persona.id, talking ? NPC_SPEED * 0.7 : NPC_SPEED, clamped);
    if (step) {
      livePos.current.set(step.x, 0, step.z);
      liveYaw.current = step.yaw;
    }

    // look-at: quem está em conversa "puxa" o olhar do jogador
    if (talking) {
      setTalkLookTarget(livePos.current.x, livePos.current.z, true);
    }
  });

  const hasGlb = Boolean(persona.bodyScan?.glbUrl?.trim());

  return (
    <>
      {hasGlb ? (
        <MemorialBody
          persona={persona}
          livePos={livePos}
          liveYaw={liveYaw}
          gesturePose={gesturePose}
        />
      ) : (
        <Figure
          persona={persona}
          position={[home.x, 0, home.z]}
          yaw={0}
          livePos={livePos.current}
          liveYaw={liveYaw}
          talking={talking}
          onSelect={onSelect}
          gesturePose={gesturePose}
          nearest={nearest}
        />
      )}
    </>
  );
}

/** Jogador também “recebe” o gesto (braços abrem no abraço). */
function PlayerWithGesture({
  persona,
  playerPos,
  playerYaw,
}: {
  persona: Persona;
  playerPos: THREE.Vector3;
  playerYaw: RefObject<number>;
}) {
  const gesturePose = useRef<GesturePose>(emptyGesture());
  useEffect(() => {
    return onSensationEvent((e) => {
      if (!e) return;
      // qualquer gesto dirigido a outra persona: o jogador espelha o abraço/toque
      if (e.gesture === "hug" || e.gesture === "hand" || e.gesture === "shoulder") {
        gesturePose.current = {
          gesture: e.gesture,
          amount: 0,
          until: performance.now() + (e.durationMs || 1000),
          armOpen: e.armOpen ?? 0.85,
          holdBias: e.holdBias ?? 0.55,
          hugStyle: e.hugStyle,
          facialSide: e.facialSide,
        };
      }
    });
  }, []);

  return (
    <Figure
      persona={persona}
      isPlayer
      position={[playerPos.x, 0, playerPos.z]}
      yaw={0}
      livePos={playerPos}
      liveYaw={playerYaw}
      gesturePose={gesturePose}
    />
  );
}

export function FamilyFigures({
  personas,
  playerId,
  playerPos,
  playerYaw,
  talkingId,
  nearestId,
  onSelect,
}: {
  personas: Persona[];
  playerId: string;
  playerPos: THREE.Vector3;
  playerYaw: RefObject<number>;
  talkingId: string | null;
  nearestId?: string | null;
  onSelect: (id: string) => void;
}) {
  const others = useMemo(() => personas.filter((p) => p.id !== playerId), [personas, playerId]);
  const player = personas.find((p) => p.id === playerId);

  useEffect(() => {
    for (const p of others) {
      const u = p.bodyScan?.glbUrl?.trim();
      if (u) preloadMemorialAvatar(u);
    }
  }, [others]);

  return (
    <>
      {others.map((p, i) => {
        const spawn = ROOM_SPAWNS[p.room];
        const x = spawn.x + (i % 2 === 0 ? 0.15 : -0.2);
        const z = spawn.z;
        // A condição anterior — memorial || falando || vivo — era sempre
        // verdadeira, por isso toda a gente convergia para o jogador em
        // permanência. Aproximam-se quem está em conversa, e as memoriais,
        // que é o gesto que a experiência quer.
        const approach = talkingId === p.id || p.kind === "memorial";
        return (
          <WalkingNpc
            key={p.id}
            persona={p}
            home={{ x, z }}
            playerPos={playerPos}
            talking={talkingId === p.id}
            approach={approach}
            nearest={nearestId === p.id || talkingId === p.id}
            onSelect={() => onSelect(p.id)}
          />
        );
      })}
      {player &&
        (player.bodyScan?.glbUrl ? (
          <GlbErrorBoundary
            label={`player-world:${player.id}`}
            fallback={
              <PlayerWithGesture persona={player} playerPos={playerPos} playerYaw={playerYaw} />
            }
          >
            <PlayerBody persona={player} playerPos={playerPos} playerYaw={playerYaw} />
          </GlbErrorBoundary>
        ) : (
          <PlayerWithGesture persona={player} playerPos={playerPos} playerYaw={playerYaw} />
        ))}
    </>
  );
}
