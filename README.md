## Cérebro mímico

- `src/lib/mimetic-brain/` — skills + orquestração + memória ML local
- Absorve memórias e chat; recupera traços com **BM25F (campos) + hybrid** lexical; evolui resumo/traços
- É **mímica**, não a pessoa (ver `ETHICAL_GUARDRAILS`)
- Exemplo: `src/lib/mimetic-brain/example-bm25f.ts` (`exampleBm25FSearch`, `exampleMimeticPipeline`)

```ts
import { topKBm25F } from "@/lib/mimetic-brain/embed";
import { MimeticBrain } from "@/lib/mimetic-brain";

// Ranking por campos (título > corpo > chat)
const hits = topKBm25F("goiabeira", docs, 5);

// Pipeline completo
const brain = MimeticBrain.bootstrap(persona);
brain.absorbMemory(memory);
const systemPrompt = brain.composeSystemPrompt("o que ele plantou?");
```


## LGPD e ética

- `src/lib/lgpd.ts` — inventário, consentimentos, portabilidade
- `src/lib/ethics.ts` — guardrails no systemPrompt + saída suave
- UI: `/places` → **Privacidade e LGPD**
- `LEGAL.md` — notas para o jurídico

## TURN (WebRTC)

### Produção (recomendado)
- `GET /api/turn/credentials` → iceServers com username=expiry + HMAC-SHA1
- Env servidor: `TURN_URLS`, `TURN_SECRET`, `TURN_TTL_SECONDS`
- `docker-compose.turn.yml` — coturn com `--use-auth-secret`

```bash
export EXTERNAL_IP=$(curl -4 -s ifconfig.me)
export TURN_SECRET=troque_isto
docker compose -f docker-compose.turn.yml up -d
# .env da app:
# TURN_URLS=turn:$EXTERNAL_IP:3478
# TURN_SECRET=troque_isto
```

### Fallback no cliente
- UI `/places` → TURN ou `VITE_TURN_*`
- `src/lib/ice-config.ts` — `resolveIceServers()` (API → cache → local)

## Voz em tempo real

- `src/lib/voice-chat.ts` — WebRTC mesh + STUN Google
- Sinalização no mesmo `RealtimeTransport` (`type: "voice"`)
- HUD: **Voz** · silenciar · ensurdecer
- Volume espacial por distância no lar (~1,5–12 m)

## Multiplayer (PartyKit)

- `src/lib/realtime.ts` — local | partykit | ws
- `party/presenca.ts` + `partykit.json`
- UI: `/places` → **Interconexão**

```bash
npx partykit dev          # host local
# App → PartyKit → host mostrado no terminal
npx partykit deploy
```

Env opcional: `VITE_PARTYKIT_HOST=...`

## O meu corpo (scan do utilizador)

### Animações sem Mixamo
- `lib/default-anim.ts` — pack procedural + retarget por nome de bone
- Modos: `clips` | `bones` | `root` (`window.__avatarAnimMode`)

### Mixamo
- `lib/mixamo.ts` — classificação de clips
- `player-avatar.tsx` — AnimationMixer (idle / walk / hug)
- UI: marcar GLB como rigado + guia passo a passo



- `Persona.bodyScan` + `player-avatar.tsx` (useGLTF)
- UI em `/places` → **O meu corpo**
- Sem GLB → avatar cápsula de sempre
- `public/avatars/` para ficheiros otimizados

## Sensação (háptica / traje)

**Decisão de produto:** fechar o ciclo *ver → ouvir → sentir* com **gesto no avatar**
sincronizado à háptica (abraço, mão, ombro, batimento). O simulador visual do traje
fica para quando existir hardware.



- `lib/sensation.ts` — gestos (mão, ombro, abraço, batimento), canais telefone/gamepad/XR/traje
- Consentimento memorial obrigatório
- Painel em `/places` · botões no HUD perto de alguém
- Protocolo JSON do traje (`SUIT_PROTOCOL_DOC`) via WebSocket

# Presença

O lar virtual onde a família continua junta — vivos, lugares reais e memoriais.

## Novidades deste pacote

### NavMesh (navegação)

- Clique no chão → caminho + **faixa sage** no piso (`PlayerPathRibbon`)
- Personas (memoriais/vivos) **aproximam-se** do jogador via A* (`WalkingNpc`)
- Conversa aberta ou distância &lt; 9 m dispara repath ~1,8 s

### NavMesh (núcleo)

- `navmesh.ts` — A* na grelha, string-pull, snap ao mesh
- Clique curto no chão → caminho até o ponto (anel sage)
- WASD/joystick cancela o caminho automático
- Atualiza junto com `setScanCollision` / simple-room / oliveira

### Colisão GLB (otimizada)

- `scan-collision.ts` — bounds XZ, AABBs de móveis, grelha de ocupação
- `setScanCollision` — modo `scan` (slide move, sem raycast por frame)
- Preferir `colliderUrl` low-poly; senão amostra o GLB visual
- Debug: `window.__scanCollision`

### Loader `scan-glb` (`useGLTF` + collider)

- `src/components/world/scanned-place.tsx` — carrega GLB com Drei `useGLTF`, sombra, Suspense
- Sem `glbUrl` → fallback `SimpleRoom` (medidas)
- `colliderUrl` opcional (mesh invisível)
- Bounding box exposto em `window.__scanBounds` para debug
- `/places` → **Anexar GLB ao lugar scan**

Fluxo:

```bash
# 1. Scan no Polycam/Scaniverse → export GLB
# 2. Otimizar
npx @gltf-transform/cli optimize casa.glb public/scans/casa-web.glb \
  --compress draco --texture-compress webp
# 3. Em /places, anexe a URL /scans/casa-web.glb ao lugar "Casa escaneada"
# 4. Entrar no mundo
```

### API de voz ElevenLabs

| Rota | Arquivo |
|------|---------|
| `POST /api/voice/clone` | `src/routes/api/voice/clone.ts` |
| `POST /api/voice/tts` | `src/routes/api/voice/tts.ts` |
| Lógica | `src/server/voice.ts` |
| HTTP adapters | `src/server/voice-http.ts` |
| Server fn helpers | `src/server/voice-fns.ts` |
| Cliente | `src/lib/voice.ts` (já usado no cofre/chat) |

```bash
export ELEVENLABS_API_KEY=sk-...
export XAI_API_KEY=...
```

No TanStack Start, registre os handlers POST das rotas API (ou use `createServerFn` com `voice-fns.ts`). Em dev Vite puro, monte um plugin/middleware que encaminhe `/api/voice/*` para `handleVoiceClone` / `handleVoiceTts`.

### Layouts de lugar

| layout | Componente |
|--------|------------|
| `oliveira-house` | `House` (demo) |
| `simple-room` | `SimpleRoom` (medidas) |
| `scan-glb` | `ScannedPlace` |
| `garden-only` | campo aberto aproximado |

### Interconexão

BroadcastChannel local; stub PartyKit em `lib/realtime.ts`.

## Como rodar

```bash
npm install
npm run dev
```

## Ética

Reconstrução de memória. Voz clonada exige consentimento (UI do cofre). Scan da casa é dado sensível.
