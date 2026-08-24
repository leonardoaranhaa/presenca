# Configurações — mapa de efeito no código

Página: **`/settings`**. Cada caixa só aparece se alterar o runtime.

| Secção       | Onde grava                     | Onde aplica                                                         |
| ------------ | ------------------------------ | ------------------------------------------------------------------- |
| Qualidade 3D | `store.qualityTier` (persist)  | `experience.tsx` → `dpr`, `shadows`, `antialias` via `getQuality()` |
| O meu corpo  | `persona.bodyScan` (player)    | `player-avatar.tsx` / `PlayerBody`                                  |
| Sensação     | `localStorage` sensation prefs | `sensation-bridge.tsx`, `playSensation()`                           |
| Ligação      | PartyKit + voice session       | `connectPlace()`, `voice-chat.ts`, TURN                             |
| Serviços     | só leitura                     | `GET /api/status`                                                   |
| Privacidade  | `lgpd` prefs                   | `featureAllowed()` (voz, scan, etc.), export/wipe                   |

## Páginas limpas

| Rota           | Conteúdo                                    |
| -------------- | ------------------------------------------- |
| `/places`      | Lugares, cômodo por medidas, scan GLB       |
| `/persona/$id` | Memórias, avatar, mapa mímico, chat, editar |
| `/settings`    | Todas as preferências em caixas separadas   |
| `/world`       | Experiência 3D                              |

## O que não é config solta

- Avatar por fotos → na persona (afeta `bodyScan` dessa presença)
- Qualidade no header de Lugares → removida; usar `/settings#qualidade`
