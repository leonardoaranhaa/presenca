import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { PLAYER_ID } from "@/lib/seed";
import { npcAgents } from "./navmesh";
import { usePresence } from "@/lib/store";
import { ROOM_SPAWNS } from "@/lib/types";
import { FamilyFigures, PeerFigures } from "./figures";
import { House } from "./house";
import { SimpleRoom } from "./simple-room";
import { ScannedPlace, preloadScan } from "./scanned-place";
import { preloadPlayerAvatar, playerSpeedRef } from "./player-avatar";
import { setCollisionMode } from "./collision";
import { DEFAULT_METRICS } from "@/lib/room-metrics";
import { WorldHud } from "./hud";
import { attachWorldInput, worldInput } from "./input";
import { PlayerRig } from "./player";
import { NavClickTarget } from "./nav-click";
import { PlayerPathRibbon } from "./path-line";
import { SensationBridge } from "./sensation-bridge";

export function WorldExperience() {
  /** Persona mais próxima — ref, para não fazer setState a cada frame. */
  const nearestRef = useRef({ id: null as string | null, dist: 99 });
  const personas = usePresence((s) => s.personas);
  const peers = usePresence((s) => s.peers);
  const setPose = usePresence((s) => s.setPose);
  const activeChatId = usePresence((s) => s.activeChatId);
  const setActive = usePresence((s) => s.setActiveChat);
  const activePlaceId = usePresence((s) => s.activePlaceId);
  const places = usePresence((s) => s.places);
  const connectPlace = usePresence((s) => s.connectPlace);
  const disconnectPlace = usePresence((s) => s.disconnectPlace);
  const publishPose = usePresence((s) => s.publishPose);
  const quality = usePresence((s) => s.getQuality());

  const [entered, setEntered] = useState(false);
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  /** HUD poll — atualiza no máximo ~10 Hz, não no frame. */
  const [nearHud, setNearHud] = useState({ id: null as string | null, dist: 99 });

  // Leitura única: a pose guardada só semeia a posição inicial. Subscrevê-la
  // faria o Canvas inteiro re-renderizar a cada gravação.
  const pos = useRef(
    new THREE.Vector3(usePresence.getState().pose.x, 0, usePresence.getState().pose.z),
  );
  const yawRef = useRef(usePresence.getState().pose.yaw);
  const lastSave = useRef(0);
  const lastPublish = useRef(0);
  const personasRef = useRef(personas);
  personasRef.current = personas;

  const place = places.find((p) => p.id === activePlaceId) ?? places[0];

  useEffect(() => {
    const layout = place?.layout ?? "oliveira-house";
    if (layout === "simple-room") {
      setCollisionMode("simple-room", place?.metrics ?? DEFAULT_METRICS);
    } else if (layout === "scan-glb") {
      // Até o GLB carregar e chamar setScanCollision, usa medidas como fallback
      setCollisionMode("simple-room", place?.metrics ?? DEFAULT_METRICS);
    } else if (layout === "garden-only") {
      setCollisionMode("open");
    } else {
      setCollisionMode("oliveira");
    }
  }, [place?.id, place?.layout, place?.metrics]);

  useEffect(() => attachWorldInput(), []);

  useEffect(() => {
    const url = place?.scan?.glbUrl;
    if (place?.layout === "scan-glb" && url) preloadScan(url);
  }, [place?.layout, place?.scan?.glbUrl]);

  useEffect(() => {
    const body = personas.find((p) => p.isPlayer)?.bodyScan?.glbUrl;
    if (body) preloadPlayerAvatar(body);
  }, [personas]);

  useEffect(() => {
    if (!entered) return;
    connectPlace();
    return () => disconnectPlace();
  }, [entered, activePlaceId, connectPlace, disconnectPlace]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (
        nearestRef.current.id !== nearHud.id ||
        Math.abs(nearestRef.current.dist - nearHud.dist) > 0.15
      ) {
        setNearHud({ id: nearestRef.current.id, dist: nearestRef.current.dist });
      }
    }, 100);
    return () => clearInterval(id);
  }, [nearHud.id, nearHud.dist]);

  useEffect(() => {
    const el = canvasEl;
    if (!el || !entered || activeChatId) return;
    let pid: number | null = null;
    let lx = 0;
    let ly = 0;
    const down = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      pid = e.pointerId;
      lx = e.clientX;
      ly = e.clientY;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (pid !== e.pointerId || worldInput.locked) return;
      worldInput.lookDx += e.clientX - lx;
      worldInput.lookDy += e.clientY - ly;
      lx = e.clientX;
      ly = e.clientY;
    };
    const up = () => {
      pid = null;
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [canvasEl, entered, activeChatId]);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-background [touch-action:none]">
      <Canvas
        shadows={quality.shadows}
        dpr={quality.dpr}
        performance={{ min: 0.5 }}
        camera={{ position: [0, 2.4, 6], fov: 55, near: 0.1, far: 80 }}
        gl={{
          antialias: quality.antialias,
          powerPreference: "high-performance",
          stencil: false,
          depth: true,
          alpha: false,
        }}
        onCreated={({ gl, scene }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          gl.shadowMap.enabled = quality.shadows;
          gl.shadowMap.type = THREE.PCFShadowMap;
          gl.xr.enabled = true;
          scene.fog = new THREE.Fog("#1c2228", 18, 42);
          scene.background = new THREE.Color("#1c2228");
          setCanvasEl(gl.domElement);
        }}
      >
        <hemisphereLight args={["#8a96a4", "#3a3228", 0.55]} />
        <directionalLight
          position={[6, 8, 4]}
          intensity={1.15}
          color="#e8e0d2"
          castShadow={quality.shadows}
          shadow-mapSize-width={quality.shadowMapSize || 512}
          shadow-mapSize-height={quality.shadowMapSize || 512}
          shadow-camera-far={40}
          shadow-camera-left={-16}
          shadow-camera-right={16}
          shadow-camera-top={16}
          shadow-camera-bottom={-16}
        />
        <ambientLight intensity={0.18} />
        {place?.layout === "scan-glb" ? (
          <ScannedPlace scan={place.scan} metrics={place.metrics ?? DEFAULT_METRICS} />
        ) : place?.layout === "simple-room" ? (
          <SimpleRoom metrics={place?.metrics ?? DEFAULT_METRICS} />
        ) : place?.layout === "garden-only" ? (
          <SimpleRoom
            metrics={{ widthM: 8, depthM: 8, heightM: 0.1, windowCount: 0, doorWidthM: 2 }}
          />
        ) : (
          <House />
        )}
        <PlayerRig
          pos={pos.current}
          chatOpen={!!activeChatId || !entered}
          onPos={(x, z, yaw, speed) => {
            playerSpeedRef.current = speed;
            yawRef.current = yaw;
            // Persona mais próxima, sem passar por React state.
            // Usa a posição ao vivo do agente: as personas andam pelo lar via
            // A*, por isso medir contra o spawn dava a distância errada assim
            // que alguém saía do sítio — a UI de conversa e os gestos de
            // sensação disparavam (ou não) no momento errado.
            let bestId: string | null = null;
            let bestDist = 99;
            for (const p of personasRef.current) {
              if (p.isPlayer) continue;
              const agent = npcAgents.get(p.id);
              const spawn = ROOM_SPAWNS[p.room];
              const px = agent?.x ?? spawn.x;
              const pz = agent?.z ?? spawn.z;
              const d = Math.hypot(x - px, z - pz);
              if (d < bestDist) {
                bestDist = d;
                bestId = p.id;
              }
            }
            nearestRef.current = { id: bestId, dist: bestDist };

            const now = performance.now();
            // Persistência: amortecida, para o localStorage não ser escrito por frame.
            if (now - lastSave.current > 800) {
              lastSave.current = now;
              setPose({ x, z, yaw });
            }
            // Rede: frequente, mas passada por argumento — escrever no store a
            // este ritmo re-renderizava toda a cena.
            if (now - lastPublish.current > 120) {
              lastPublish.current = now;
              publishPose({ x, z, yaw });
            }
          }}
        />
        <NavClickTarget playerPos={pos.current} enabled={entered && !activeChatId} />
        <PlayerPathRibbon />
        <FamilyFigures
          personas={personas}
          playerId={PLAYER_ID}
          playerPos={pos.current}
          playerYaw={yawRef}
          talkingId={activeChatId}
          onSelect={(id) => {
            if (worldInput.locked) document.exitPointerLock?.();
            setActive(id);
          }}
        />
        <PeerFigures peers={peers} />
      </Canvas>
      <SensationBridge
        personas={personas}
        nearestId={nearHud.id}
        nearestDist={nearHud.dist}
        playerId={PLAYER_ID}
      />
      <WorldHud
        nearestId={nearHud.id}
        nearestDist={nearHud.dist}
        entered={entered}
        onEnter={() => setEntered(true)}
        vrCanvas={canvasEl}
        placeName={place?.name}
        peerCount={peers.length}
      />
    </div>
  );
}
