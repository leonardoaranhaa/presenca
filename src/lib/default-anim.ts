/**
 * Pack de animações padrão (sem Mixamo) + retarget genérico por nome de bone.
 *
 * 1) Mesh estático: bob / sway / lean a partir da velocidade.
 * 2) Skeleton sem clips: rotaciona bones com nomes humanoides (Mixamo, Ready Player Me, etc.).
 * 3) Com clips Mixamo: o player-avatar continua a preferir AnimationMixer.
 */

import * as THREE from "three";

/** Nomes de bones aceites (substring, case-insensitive). */
export const BONE_ALIASES = {
  hips: ["hips", "pelvis", "hip", "root"],
  spine: ["spine", "spine1", "spine_01"],
  spine2: ["spine2", "spine_02", "chest"],
  neck: ["neck"],
  head: ["head"],
  leftArm: ["leftarm", "left_arm", "upperarm_l", "arm_l", "l_upperarm"],
  rightArm: ["rightarm", "right_arm", "upperarm_r", "arm_r", "r_upperarm"],
  leftFore: ["leftforearm", "left_forearm", "lowerarm_l", "l_forearm", "leftarm_forearm"],
  rightFore: ["rightforearm", "right_forearm", "lowerarm_r", "r_forearm"],
  leftUpLeg: ["leftupleg", "left_upleg", "thigh_l", "l_thigh", "leftleg"],
  rightUpLeg: ["rightupleg", "right_upleg", "thigh_r", "r_thigh", "rightleg"],
  leftLeg: ["leftleg", "left_leg", "calf_l", "l_calf", "leftshin"],
  rightLeg: ["rightleg", "right_leg", "calf_r", "r_calf"],
} as const;

export type BoneMap = Partial<Record<keyof typeof BONE_ALIASES, THREE.Bone>>;

export function mapHumanoidBones(root: THREE.Object3D): BoneMap {
  const map: BoneMap = {};
  const bones: THREE.Bone[] = [];
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
  });

  for (const bone of bones) {
    const n = bone.name.replace(/[:\s-]/g, "").toLowerCase();
    for (const [role, aliases] of Object.entries(BONE_ALIASES) as [
      keyof typeof BONE_ALIASES,
      readonly string[],
    ][]) {
      if (map[role]) continue;
      if (aliases.some((a) => n.includes(a.replace(/_/g, "")))) {
        map[role] = bone;
      }
    }
  }
  return map;
}

export type ProceduralPose = {
  /** 0 idle → 1 walk pleno */
  walkBlend: number;
  /** 0–1 abraço */
  hug: number;
  /** tempo em segundos */
  time: number;
};

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

/** Guarda rest pose na primeira chamada. */
const rest = new WeakMap<THREE.Bone, THREE.Quaternion>();

function ensureRest(bone: THREE.Bone) {
  if (!rest.has(bone)) rest.set(bone, bone.quaternion.clone());
  return rest.get(bone)!;
}

/**
 * Aplica pose procedural humanóide (retarget genérico).
 * Não precisa de clips — só de bones com nomes reconhecíveis.
 */
export function applyProceduralBones(map: BoneMap, pose: ProceduralPose) {
  const t = pose.time;
  const w = pose.walkBlend;
  const h = pose.hug;

  // pernas em ciclo de marcha
  const cycle = t * (1.8 + w * 4.5);
  const swing = Math.sin(cycle) * 0.55 * w;
  const swing2 = Math.sin(cycle + Math.PI) * 0.55 * w;

  setBone(map.leftUpLeg, swing, 0, 0);
  setBone(map.rightUpLeg, swing2, 0, 0);
  setBone(map.leftLeg, Math.max(0, -swing) * 0.4, 0, 0);
  setBone(map.rightLeg, Math.max(0, -swing2) * 0.4, 0, 0);

  // braços em oposição à perna (ou abraço)
  if (h > 0.05) {
    // abraço: braços à frente
    const a = 0.9 * h;
    setBone(map.leftArm, 0.2 * h, 0, 1.1 * a);
    setBone(map.rightArm, 0.2 * h, 0, -1.1 * a);
    setBone(map.leftFore, 0.4 * h, 0, 0.3 * h);
    setBone(map.rightFore, 0.4 * h, 0, -0.3 * h);
  } else {
    const arm = Math.sin(cycle + Math.PI) * 0.4 * w;
    const arm2 = Math.sin(cycle) * 0.4 * w;
    setBone(map.leftArm, arm, 0, 0.08);
    setBone(map.rightArm, arm2, 0, -0.08);
    setBone(map.leftFore, Math.abs(arm) * 0.3, 0, 0);
    setBone(map.rightFore, Math.abs(arm2) * 0.3, 0, 0);
  }

  // tronco / respiração
  const breath = Math.sin(t * 1.7) * 0.02 * (1 - w * 0.5);
  setBone(map.spine, breath + 0.04 * w, 0, 0);
  setBone(map.spine2, breath * 0.5, 0, 0);
  setBone(map.hips, 0, Math.sin(cycle) * 0.03 * w, 0);
  setBone(map.head, -breath * 0.5 - 0.05 * h, 0, 0);
}

function setBone(bone: THREE.Bone | undefined, x: number, y: number, z: number) {
  if (!bone) return;
  const r = ensureRest(bone);
  _e.set(x, y, z, "XYZ");
  _q.setFromEuler(_e);
  bone.quaternion.copy(r).multiply(_q);
}

/** Só mesh (sem bones): offset de posição/rotação do root. */
export function proceduralRootMotion(
  speed: number,
  time: number,
  hug: number,
): { y: number; pitch: number; scale: number } {
  const w = Math.min(1, speed / 2.5);
  const bob = Math.abs(Math.sin(time * (2 + w * 6))) * 0.03 * w;
  const breath = Math.sin(time * 1.6) * 0.01 * (1 - w);
  return {
    y: bob + breath,
    pitch: -0.06 * w - 0.1 * hug,
    scale: 1 + 0.02 * hug,
  };
}
