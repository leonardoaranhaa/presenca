/**
 * Alvo de look-at do jogador quando conversa / presença próxima.
 * Atualizado por WalkingNpc; lido por PlayerRig.
 */
export const talkLookTarget = {
  active: false,
  x: 0,
  z: 0,
};

export function setTalkLookTarget(x: number, z: number, active: boolean) {
  talkLookTarget.x = x;
  talkLookTarget.z = z;
  talkLookTarget.active = active;
}
