# Arquitetura técnica — Presença

Documento de engenharia. Visão de produto em [PRODUTO.md](PRODUTO.md); arranque em [README.md](README.md).

---

## 1. Vista de pássaro

```text
┌─────────────────────────────────────────────────────────────────┐
│                        Cliente (browser)                         │
│  React + TanStack Router/Start                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ UI (rotas)   │  │ Mundo 3D     │  │ Cérebro mímico (local)  │ │
│  │ círculo,     │  │ R3F/Three    │  │ BM25F + embeddings      │ │
│  │ persona,     │  │ navmesh,     │  │ skills + orquestração   │ │
│  │ places, HUD  │  │ peers, voz   │  │ PCA 3D (viz)            │ │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬────────────┘ │
│         │                 │                        │             │
│         │          Zustand store (persist localStorage)          │
│         │                 │                        │             │
│         └──────── fetch /api/* ────────────────────┘             │
│         │                 │                                      │
│         │          WebRTC P2P ◄── ICE (STUN/TURN)                │
│         │          PartyKit WS ◄── poses multiplayer             │
└─────────┼─────────────────┼──────────────────────────────────────┘
          │                 │
          ▼                 ▼
┌──────────────────┐  ┌─────────────────┐  ┌──────────────────────┐
│ Servidor app     │  │ PartyKit        │  │ Serviços externos    │
│ (TanStack Start) │  │ party/presenca  │  │ xAI (chat)           │
│ src/server/*     │  │ salas por lugar │  │ ElevenLabs (voz)     │
│ chaves de API    │  │                 │  │ Embeddings API (opc.)│
│ rate limit       │  │                 │  │ coturn TURN (opc.)   │
└──────────────────┘  └─────────────────┘  └──────────────────────┘
```

**Regra de ouro:** `src/lib/**` e `src/components/**` correm no browser e **nunca** importam `src/server/**`. Segredos só no servidor, atrás de `/api/*`.

---

## 2. Camadas

| Camada          | Pasta             | Responsabilidade                        |
| --------------- | ----------------- | --------------------------------------- |
| Rotas / páginas | `src/routes/`     | UI e entrada HTTP das APIs              |
| Componentes     | `src/components/` | Mundo 3D, chat, legal, persona          |
| Domínio cliente | `src/lib/`        | Store, mímico, sensação, realtime, LGPD |
| Servidor        | `src/server/`     | IA, voz, TURN, embed, rate-limit        |
| Multiplayer     | `party/`          | Durable object / room PartyKit          |

---

## 3. Fluxo de conversa (presença memorial)

```text
Utilizador escreve no PresenceChat
        │
        ▼
MimeticBrain.bootstrap(persona)
  · absorbChat / traces já no soul.mimetic
  · enrichTracesWithSemantics()     → POST /api/embed (opcional)
  · skillRetrieveAsync(query)       → BM25F + lexical + dense (RRF)
  · skillComposePrompt              → bloco "memória recuperada"
        │
        ▼
ai-client → POST /api/chat
  body: persona (sanitizada) + retrieved + history + message
        │
        ▼
server/ai.ts
  · valida com zod
  · composeSystemPrompt(persona, retrieved)  ← ética obrigatória no servidor
  · providerChat (xAI / modelo configurado)
        │
        ▼
Resposta → pushMessage → absorbChat("presence") → store persistido
```

Pontos críticos:

1. A **recuperação** é local (cofres pequenos; privacidade).
2. O **system prompt ético** é composto no **servidor**, não só no cliente — o browser não pode omitir guardrails.
3. Sem `XAI_API_KEY`, `/api/chat` devolve 503 e a UI degrada; o mundo 3D continua.

---

## 4. Cérebro mímico (`src/lib/mimetic-brain/`)

```text
types.ts          MimeticTrace, MimeticModel, fields BM25F
embed.ts          tokenize, BM25, BM25F, hybrid RRF, lexical embed
semantic.ts       cliente /api/embed + cache
skills.ts         ingest_memory, ingest_chat, retrieve, evolve, compose
orchestrator.ts   MimeticBrain — API pública
project3d.ts      PCA para visualização (não entra no ranking)
```

### Indexação

Cada memória ou turno vira um `MimeticTrace`:

- `text` — concatenado (prompt)
- `fields` — `title` / `body` / `correction` / `chat` (BM25F)
- `vector` — embedding lexical (hash 64-D + bigramas)
- `semanticVector?` — dense via API, preenchido sob demanda

### Recuperação (hybrid)

1. **BM25F** com boosts (`title: 3`, `correction: 2.5`, `body: 1`, …)
2. **Cosseno lexical** só em docs com BM25 &gt; 0 (evita ruído do hashing)
3. **Cosseno semântico** se query e doc tiverem dense vectors
4. **RRF** (`1/(60+rank)`) funde as listas

Sem sinal lexical nem semântico forte → **zero hits** (o modelo não recebe “contexto inventado”).

---

## 5. Mundo 3D (`src/components/world/`)

```text
experience.tsx     Canvas R3F, iluminação, ligação realtime, HUD
house.tsx          Geometria procedural do lar
simple-room.tsx    Layout a partir de medidas
scanned-place.tsx  GLB de fotogrametria / scan
player.tsx         PlayerRig: movimento, câmara, look-at
figures.tsx        NPCs, peers, anel “nearest”, approach
navmesh.ts         Grelha + A* + string-pull
collision.ts       AABB / slideMove
input.ts           Teclado, rato, touch, gamepad, KeyE
hud.tsx            Entrar, conversar ≤2,5 m, chat sheet
voice-controls.tsx WebRTC join/leave
look-target.ts     Alvo de yaw quando há conversa ativa
```

### Loop de frame (simplificado)

```text
useFrame:
  ler worldInput (WASD / joystick / look)
  se navAgent ativo → stepNavAgent
  senão → slideMove + colisão
  atualizar nearest persona (distância)
  publicar pose (~8 Hz) via PartyKit  ← sem setState por frame
  câmara lerp + lookAt
  se chat aberto → yaw suave a talkLookTarget
```

**Performance:** pose de rede e persistência são amortecidas; qualidade gráfica em tiers (`lib/quality.ts`); geometrias partilhadas (`shared-geometries.ts`).

---

## 6. Estado global (`src/lib/store.ts`)

Zustand + `persist` (localStorage):

| Fatia                | Conteúdo                                           |
| -------------------- | -------------------------------------------------- |
| `personas[]`         | Vivas/memoriais, memórias, soul, bodyScan, mimetic |
| `places[]`           | Lugares, métricas, scan GLB                        |
| `messages{}`         | Histórico de chat por personaId                    |
| `pose`               | x, z, yaw do jogador                               |
| `peers[]`            | Outros no lugar (efémero)                          |
| `activeChatId`       | Conversa aberta no mundo                           |
| `activePlaceId`      | Lugar atual                                        |
| qualidade / realtime | Preferências                                       |

Ações relevantes: `addMemory`, `pushMessage` (disparam treino mímico), `publishPose`, `connectPlace` / `disconnectPlace`, export/wipe LGPD.

**Nada de bytes aqui.** O `localStorage` tem ~5 MB no total e uma escrita que
estoire a quota falha o estado **inteiro** — personas e memórias incluídas, não
só o ficheiro. Fotos, notas de voz, vídeos e as media dos pedidos de avatar
vivem no IndexedDB (`lib/media-store.ts`); no estado fica um `mediaId`. Já se
perdeu o cofre uma vez por isto, e o pedido de avatar repetiu o erro.

---

## 7. APIs HTTP (`src/routes/api/` + `src/server/`)

| Rota                        | Servidor         | Função                                                 |
| --------------------------- | ---------------- | ------------------------------------------------------ |
| `POST /api/chat`            | `ai.ts`          | Conversa com presença                                  |
| `POST /api/awaken`          | `ai.ts`          | Gera soul inicial a partir do cofre                    |
| `POST /api/embed`           | `embed.ts`       | Vetores dense (opcional)                               |
| `POST /api/voice/tts`       | `voice.ts`       | Síntese ElevenLabs                                     |
| `POST /api/voice/clone`     | `voice.ts`       | Clone com consentimento                                |
| `GET /api/turn/credentials` | `turn.ts`        | TURN efémero (HMAC coturn)                             |
| `GET /api/status`           | `status.ts`      | Saúde dos serviços                                     |
| `POST /api/avatar/jobs`     | `avatar-jobs.ts` | Criar job de avatar (media → GLB)                      |
| `GET /api/avatar/jobs/:id`  | idem             | Polling do job                                         |
| `POST /api/avatar/jobs/:id` | idem             | Completar job com URL GLB — exige `AVATAR_ADMIN_TOKEN` |

Padrão: rota fina → `*-http.ts` (parse/status) → módulo de domínio → fornecedor externo. Validação **zod** na entrada.

---

## 8. Tempo real

### Poses (PartyKit)

```text
Cliente                    party/presenca.ts
  connect(placeId)  ──WS──►  room por lugar
  publish {x,z,yaw} ──────►  broadcast aos peers
  onPeers  ◄───────────────  lista + updates
```

### Voz (WebRTC mesh)

```text
voice-chat.ts
  · sinalização via canal realtime (offer/answer/ICE)
  · ICE: STUN público + TURN se /api/turn/credentials ok
  · áudio espacial atenuado por distância (opcional)
```

Limite atual: mesh P2P (poucos participantes). Fase final: SFU.

---

## 9. Sensação e háptica

```text
lib/sensation.ts          gestos, canais, abraço adaptativo
lib/facial-haptics.ts     regiões faciais
sensation-bridge.tsx      liga distância no mundo → eventos
sensation-panel.tsx       UI de preferências / teste
```

Canais: vibração do telefone, gamepad rumble, XR haptic, futuro traje. Intensidade depende de relação, memorial vs vivo, distância e preferências LGPD.

---

## 10. Privacidade e ética (código)

| Módulo                       | Papel                                         |
| ---------------------------- | --------------------------------------------- |
| `ethics.ts`                  | Guardrails no prompt + wellness / saída suave |
| `lgpd.ts`                    | Inventário, prefs, portabilidade              |
| `prompt.ts` / `server/ai.ts` | System prompt final no servidor               |
| `privacy-panel.tsx`          | UI de consentimentos                          |

---

## 11. Fronteiras e testes

```text
src/lib/__tests__/     embed, mimetic-brain, collision, project3d, boundaries
src/server/__tests__/  ai-http, voice, turn, rate-limit, prompt-integrity
e2e/                   Playwright (smoke, fluxo, mobile)
evals/                 Cenários de recuperação RAG
```

`boundaries.test.ts` garante que o cliente não importa servidor.

---

## 12. Deploy (alvo)

| Peça           | Opção típica                                                |
| -------------- | ----------------------------------------------------------- |
| App SSR/static | Node ou adaptador TanStack Start                            |
| PartyKit       | `partykit deploy`                                           |
| TURN           | `docker-compose.turn.yml` (coturn) + segredo HMAC           |
| Segredos       | Env: `XAI_API_KEY`, `ELEVENLABS_*`, `EMBEDDING_*`, `TURN_*` |

---

## 13. Diagrama de dependências (cliente)

```text
routes → components → lib/store
                   → lib/mimetic-brain
                   → lib/ai-client  → /api/*
                   → lib/realtime   → PartyKit
                   → lib/voice-chat → WebRTC + /api/turn
components/world → three / r3f / navmesh / collision
```

Nenhuma seta de `lib` ou `components` para `server`.

---

## 14. Extensões naturais

1. **SFU** de áudio (LiveKit / mediasoup) quando o mesh saturar
2. **Embeddings** sempre on (batch no ingest, não só na query)
3. **Contas** e sync servidor do cofre (hoje local-first)
4. **Pipeline fotogrametria** → GLB otimizado + collider automático
5. **Avatar from media** — `avatar-mesh-provider.ts` (Meshy/generic) + fila `avatar-jobs`; studio ou GLB manual sem API.
   As fotos ficam no IndexedDB, não no estado persistido — só o id entra no
   `localStorage`. A fila em si vive na memória do processo e **não sobrevive a
   serverless**: o caminho sem fornecedor decide-se dentro do próprio POST para
   não depender disso; os outros dois precisam de um KV (ver 3.0b no PLANO.md)
6. **SDK háptico** de traje (mesmo `sensation.ts`, novo canal)

---

_Arquitetura alinhada ao código em `src/` deste repositório. Se o código divergir, prevalece o código — e este documento deve ser atualizado._

## Ambiente 3D — pacote de estabilidade

| Módulo                | Função                                    |
| --------------------- | ----------------------------------------- |
| `place-navigation.ts` | Collider + NavMesh ao mudar de lugar      |
| `scan-scale.ts`       | Escala automática + centrar scan GLB      |
| `scanned-place.tsx`   | Scan → colisão grelha + navmesh           |
| `gesture-vfx.tsx`     | Anéis visíveis nos gestos (LGPD upstream) |
| `xr-session.tsx`      | VR + qualidade low + teleport (T)         |
| Peers                 | Interpolação + bob de caminhada           |
| `player-avatar.tsx`   | idle/walk/run Mixamo ou procedural        |

## Culling e LOD

| Módulo                                | Papel                                    |
| ------------------------------------- | ---------------------------------------- |
| `frustum-cull` / `FrustumUpdater`     | Cone da câmara                           |
| `occlusion-cull` / `OcclusionUpdater` | LOS 2D + amostragem isWalkable           |
| `lod.ts`                              | 0 próximo / 1 médio / 2 longe (silhueta) |
| `isWorldPointShown`                   | frustum ∧ ¬occluded                      |

Mock traje: `node scripts/mock-suit-server.mjs` (pacote `ws`).

## Voz: mesh → SFU

| Peers            | Topologia                          |
| ---------------- | ---------------------------------- |
| < 6              | mesh WebRTC (P2P)                  |
| ≥ 6 sem `sfuUrl` | capped-mesh (máx. soft links)      |
| ≥ 6 com `sfuUrl` | `SfuVoiceClient` — 1 PC para o SFU |

Config: Ajustes → Interconexão → WebSocket SFU.

## Oclusores do collider GLB

`extractScanOccluders` + `setScanOccluders` no load de `colliderUrl` (ou mesh visual).
Paredes finas/altas entram no LOS de `occlusion-cull`.

## Fase A (produto)

Ver `FASE_A.md`. Runtime: `registerMeshoptDecoder`, `MemorialBody`, `SoftExitBanner` no mundo, `validateGlbRef`.

## LiveKit SFU

Ver `LIVEKIT.md`. Cliente: `src/lib/livekit-sfu.ts`. Token: `GET /api/livekit/token`.

## Onboarding

`FirstPresenceWizard` (ética → lugar → presença → mundo). LiveKit: active speaker top-3.
