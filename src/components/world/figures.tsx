import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import * as THREE from "three";
import { usePresence } from "@/lib/store";
import { AVATAR_HUES, ROOM_SPAWNS, type Persona } from "@/lib/types";
import type { PeerPose } from "@/lib/realtime";
import { onSensationEvent, type SensationEvent, type SensationGesture } from "@/lib/sensation";
import { geoCapsule, geoSphere, geoSphereSm } from "./shared-geometries";
import { ensureNpcAgent, getNavMesh, setNpcDestination, stepNpcAgent } from "./navmesh";
import { PlayerBody } from "./player-avatar";

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
}) {
  const group = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
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
    const breath = Math.sin(t * (talking ? 3.2 : 1.6) + persona.name.length) * 0.015;

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

    // Braços
    if (leftArm.current && rightArm.current) {
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
export function PeerFigures({ peers }: { peers: PeerPose[] }) {
  return (
    <>
      {peers.map((p) => (
        <group key={p.peerId}>
          <group position={[p.x, 0, p.z]} rotation={[0, p.yaw + Math.PI, 0]}>
            <mesh position={[0, 0.72, 0]} geometry={geoCapsule()}>
              <meshStandardMaterial color="#5c6b7a" roughness={0.7} />
            </mesh>
            <mesh position={[0, 1.38, 0]} geometry={geoSphere()}>
              <meshStandardMaterial color="#c4a07a" roughness={0.55} />
            </mesh>
            <mesh position={[0, 1.85, 0]}>
              <sphereGeometry args={[0.05, 8, 8]} />
              <meshBasicMaterial color="#8a9a86" />
            </mesh>
          </group>
          <Billboard position={[p.x, 2.12, p.z]}>
            <Text
              fontSize={0.16}
              color="#e8e0d2"
              outlineWidth={0.008}
              outlineColor="#1c2228"
              anchorX="center"
              anchorY="middle"
              maxWidth={3}
            >
              {p.displayName || "Visitante"}
            </Text>
          </Billboard>
        </group>
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
}: {
  persona: Persona;
  home: { x: number; z: number };
  playerPos: THREE.Vector3;
  talking: boolean;
  approach: boolean;
  onSelect: () => void;
}) {
  const livePos = useRef(new THREE.Vector3(home.x, 0, home.z));
  const liveYaw = useRef(0);
  const lastRepath = useRef(0);
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
  });

  return (
    <Figure
      persona={persona}
      position={[home.x, 0, home.z]}
      yaw={0}
      livePos={livePos.current}
      liveYaw={liveYaw}
      talking={talking}
      onSelect={onSelect}
      gesturePose={gesturePose}
    />
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
  onSelect,
}: {
  personas: Persona[];
  playerId: string;
  playerPos: THREE.Vector3;
  playerYaw: RefObject<number>;
  talkingId: string | null;
  onSelect: (id: string) => void;
}) {
  const others = useMemo(() => personas.filter((p) => p.id !== playerId), [personas, playerId]);
  const player = personas.find((p) => p.id === playerId);

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
            onSelect={() => onSelect(p.id)}
          />
        );
      })}
      {player &&
        (player.bodyScan?.glbUrl ? (
          <PlayerBody persona={player} playerPos={playerPos} playerYaw={playerYaw} />
        ) : (
          <PlayerWithGesture persona={player} playerPos={playerPos} playerYaw={playerYaw} />
        ))}
    </>
  );
}
