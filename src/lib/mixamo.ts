/**
 * Convenções Mixamo → Presença
 *
 * Fluxo:
 * 1. Exportar personagem (OBJ/FBX) a partir do scan
 * 2. https://www.mixamo.com → Upload → Auto-Rigger
 * 3. Download FBX (With Skin) + animações Idle, Walking, etc.
 * 4. Converter para GLB (Blender ou:
 *    npx @gltf-transform/cli copy character.fbx public/avatars/eu-rig.glb)
 * 5. O meu corpo → URL do GLB rigado
 *
 * Mixamo não tem API pública estável para auto-upload; o “automático”
 * no app é: detetar skeleton + AnimationMixer + nomes de clips.
 */

export type MixamoClipRole = "idle" | "walk" | "run" | "hug" | "wave" | "sit";

/** Padrões de nome (case-insensitive) por papel. */
export const MIXAMO_CLIP_PATTERNS: Record<MixamoClipRole, RegExp[]> = {
  idle: [/idle/i, /standing/i, /breath/i, /t-pose/i, /tpose/i],
  walk: [/walk/i, /walking/i, /locomotion/i],
  run: [/run/i, /jog/i, /sprint/i],
  hug: [/hug/i, /embrace/i, /kiss/i],
  wave: [/wave/i, /hello/i, /greet/i],
  sit: [/sit/i, /sitting/i],
};

export function classifyClipName(name: string): MixamoClipRole | null {
  const n = name.replace(/^mixamo\.com\|/i, "").trim();
  for (const [role, patterns] of Object.entries(MIXAMO_CLIP_PATTERNS) as [
    MixamoClipRole,
    RegExp[],
  ][]) {
    if (patterns.some((re) => re.test(n))) return role;
  }
  return null;
}

export function findClip(
  clips: { name: string }[],
  role: MixamoClipRole,
): { name: string } | undefined {
  return clips.find((c) => classifyClipName(c.name) === role);
}

export const MIXAMO_GUIDE = `
Mixamo · rig automático
───────────────────────
1. No Blender (ou MeshLab): abra o scan, limpe o mesh, exporte FBX/OBJ.
2. mixamo.com (conta Adobe) → Upload Character → Auto-Rigger.
3. Baixe o personagem With Skin (FBX).
4. Baixe animações: Idle, Walking (In Place se possível), opcional Hug.
   Dica: baixe como FBX e combine no Blender, ou baixe um pack com skin.
5. Exporte um único GLB com esqueleto + clips:
     Blender → File → Export → glTF 2.0 (include animations)
   ou:
     npx @gltf-transform/cli copy personagem.fbx public/avatars/eu-rig.glb
6. Presença → O meu corpo → URL /avatars/eu-rig.glb + altura.

Nomes de clips reconhecidos: Idle, Walk/Walking, Run, Hug, Wave, Sit.
`;
