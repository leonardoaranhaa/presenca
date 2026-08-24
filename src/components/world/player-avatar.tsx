import { Suspense, useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { GlbErrorBoundary } from "./glb-fallback";
import * as THREE from "three";
import { GLTF_LOADER_OPTS } from "@/lib/asset-pipeline";
import type { Persona } from "@/lib/types";
import type { SensationEvent } from "@/lib/sensation";
import { onSensationEvent } from "@/lib/sensation";
import { classifyClipName, type MixamoClipRole } from "@/lib/mixamo";
import {
  applyProceduralBones,
  mapHumanoidBones,
  proceduralRootMotion,
  type BoneMap,
} from "@/lib/default-anim";

export const playerSpeedRef = { current: 0 };

/**
 * Avatar do jogador:
 * 1. Clips Mixamo → AnimationMixer
 * 2. Skeleton sem clips → pack procedural (bones)
 * 3. Mesh estático → bob/lean procedural no root
 */
export function PlayerAvatarFromScan({
  playerPos,
  playerYaw,
  glbUrl,
  heightM = 1.7,
  speedRef,
}: {
  persona: Persona;
  playerPos: THREE.Vector3;
  playerYaw: RefObject<number>;
  glbUrl: string;
  heightM?: number;
  speedRef?: RefObject<number>;
}) {
  return (
    <Suspense fallback={null}>
      <ScannedPlayerBody
        playerPos={playerPos}
        playerYaw={playerYaw}
        url={glbUrl}
        heightM={heightM}
        speedRef={speedRef}
      />
    </Suspense>
  );
}

function ScannedPlayerBody({
  playerPos,
  playerYaw,
  url,
  heightM,
  speedRef,
}: {
  playerPos: THREE.Vector3;
  playerYaw: RefObject<number>;
  url: string;
  heightM: number;
  speedRef?: RefObject<number>;
}) {
  const gltf = useGLTF(url, GLTF_LOADER_OPTS.useDraco, GLTF_LOADER_OPTS.useMeshopt);
  const root = useRef<THREE.Group>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Partial<Record<MixamoClipRole, THREE.AnimationAction>>>({});
  const currentRole = useRef<MixamoClipRole | "none">("none");
  const hugAmt = useRef(0);
  const hugUntil = useRef(0);
  const boneMap = useRef<BoneMap>({});
  const mode = useRef<"clips" | "bones" | "root">("root");
  const clock = useRef(0);

  const scene = useMemo(() => {
    const s = gltf.scene.clone(true);
    s.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
        const m = o as THREE.SkinnedMesh;
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
      } else if ((o as THREE.Mesh).isMesh) {
        const m = o as THREE.Mesh;
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    const box = new THREE.Box3().setFromObject(s);
    const size = new THREE.Vector3();
    box.getSize(size);
    if (size.y > 0.1) s.scale.setScalar(heightM / size.y);
    box.setFromObject(s);
    s.position.y = -box.min.y;
    return s;
  }, [gltf.scene, heightM]);

  useEffect(() => {
    const clips = gltf.animations ?? [];
    boneMap.current = mapHumanoidBones(scene);
    const boneCount = Object.keys(boneMap.current).length;

    if (clips.length > 0) {
      mode.current = "clips";
      const mixer = new THREE.AnimationMixer(scene);
      mixerRef.current = mixer;
      const actions: Partial<Record<MixamoClipRole, THREE.AnimationAction>> = {};
      for (const clip of clips) {
        const role = classifyClipName(clip.name);
        if (!role || actions[role]) continue;
        actions[role] = mixer.clipAction(clip);
      }
      if (!actions.idle && clips[0]) actions.idle = mixer.clipAction(clips[0]);
      actionsRef.current = actions;
      if (actions.idle) {
        actions.idle.reset().fadeIn(0.25).play();
        currentRole.current = "idle";
      }
      if (typeof window !== "undefined") {
        (
          window as unknown as { __avatarAnimMode?: string; __mixamoClips?: string[] }
        ).__avatarAnimMode = "clips";
        (window as unknown as { __mixamoClips?: string[] }).__mixamoClips = clips.map(
          (c) => c.name,
        );
      }
      return () => {
        mixer.stopAllAction();
        mixerRef.current = null;
      };
    }

    if (boneCount >= 3) {
      mode.current = "bones";
      if (typeof window !== "undefined") {
        (
          window as unknown as { __avatarAnimMode?: string; __boneRoles?: string[] }
        ).__avatarAnimMode = "bones";
        (window as unknown as { __boneRoles?: string[] }).__boneRoles = Object.keys(
          boneMap.current,
        );
      }
      return;
    }

    mode.current = "root";
    if (typeof window !== "undefined") {
      (window as unknown as { __avatarAnimMode?: string }).__avatarAnimMode = "root";
    }
  }, [gltf.animations, scene]);

  useEffect(() => {
    return onSensationEvent((e: SensationEvent | null) => {
      if (!e) return;
      if (e.gesture === "hug" || e.gesture === "hand" || e.gesture === "shoulder") {
        hugUntil.current = performance.now() + (e.durationMs || 1200);
        if (e.gesture === "hug" && actionsRef.current.hug) {
          fadeTo("hug");
        }
      }
    });
  }, []);

  function fadeTo(role: MixamoClipRole) {
    const actions = actionsRef.current;
    const next = actions[role];
    if (!next || currentRole.current === role) return;
    const prev =
      currentRole.current !== "none" ? actions[currentRole.current as MixamoClipRole] : undefined;
    prev?.fadeOut(0.2);
    next.reset().setEffectiveWeight(1).fadeIn(0.2).play();
    if (role === "hug") {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
    }
    currentRole.current = role;
  }

  useFrame((_, delta) => {
    if (!root.current) return;
    clock.current += delta;
    const speed = speedRef?.current ?? playerSpeedRef.current;
    const now = performance.now();

    // envelope abraço
    if (now < hugUntil.current) {
      const left = hugUntil.current - now;
      const dur = 1200;
      const e = 1 - left / dur;
      hugAmt.current = e < 0.2 ? e / 0.2 : e < 0.65 ? 1 : Math.max(0, 1 - (e - 0.65) / 0.35);
    } else {
      hugAmt.current = 0;
    }

    root.current.position.x = playerPos.x;
    root.current.position.z = playerPos.z;
    root.current.rotation.y = playerYaw.current + Math.PI;

    if (mode.current === "clips" && mixerRef.current) {
      mixerRef.current.update(delta);
      if (now >= hugUntil.current && currentRole.current === "hug") {
        fadeTo(speed > 0.35 ? "walk" : "idle");
      } else if (currentRole.current !== "hug") {
        if (speed > 2.2 && actionsRef.current.run) fadeTo("run");
        else if (speed > 0.35 && actionsRef.current.walk) fadeTo("walk");
        else if (speed <= 0.35 && actionsRef.current.idle) fadeTo("idle");
      }
      root.current.position.y = 0;
      root.current.rotation.x = 0;
      root.current.scale.setScalar(1);
      return;
    }

    if (mode.current === "bones") {
      applyProceduralBones(boneMap.current, {
        walkBlend: Math.min(1, speed / 2.8),
        hug: hugAmt.current,
        time: clock.current,
      });
      root.current.position.y = 0;
      root.current.rotation.x = -0.04 * Math.min(1, speed / 2.5);
      root.current.scale.setScalar(1);
      return;
    }

    // root-only
    const m = proceduralRootMotion(speed, clock.current, hugAmt.current);
    root.current.position.y = m.y;
    root.current.rotation.x = m.pitch;
    root.current.scale.setScalar(m.scale);
  });

  return (
    <group ref={root}>
      <primitive object={scene} />
    </group>
  );
}

export function preloadPlayerAvatar(url: string) {
  if (url) useGLTF.preload(url);
}

export function PlayerBody({
  persona,
  playerPos,
  playerYaw,
}: {
  persona: Persona;
  playerPos: THREE.Vector3;
  playerYaw: RefObject<number>;
}) {
  const url = persona.bodyScan?.glbUrl?.trim();
  if (!url) return null;
  return (
    <GlbErrorBoundary label={`player:${persona.id}`} fallback={null} notify>
      <PlayerAvatarFromScan
        persona={persona}
        playerPos={playerPos}
        playerYaw={playerYaw}
        glbUrl={url}
        heightM={persona.bodyScan?.heightM ?? 1.7}
        speedRef={playerSpeedRef}
      />
    </GlbErrorBoundary>
  );
}
