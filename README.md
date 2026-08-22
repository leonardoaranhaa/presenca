# Presença

O lar virtual onde a família continua junta — vivos, lugares reais e memoriais.

A presença é **mímica**: imita o jeito, a voz e as memórias que a família confia.
Não é a pessoa, não finge ser, e diz isso quando lhe perguntam. Ver [LEGAL.md](LEGAL.md)
e `src/lib/ethics.ts`.

## Começar

```bash
npm install
cp .env.example .env   # opcional: sem chaves a app corre em modo degradado
npm run dev            # http://localhost:8080
```

| Comando | O que faz |
|---------|-----------|
| `npm run dev` | Servidor de desenvolvimento (porta 8080) |
| `npm run build` | Build de produção (cliente + SSR) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Testes (vitest) |
| `npm run party:dev` | Servidor PartyKit local |
| `npm run party:deploy` | Publicar o PartyKit |

Sem `XAI_API_KEY` a app arranca e navega-se pelo mundo; a conversa responde 503 e
a UI avisa. Sem `ELEVENLABS_API_KEY` a presença fala pelo leitor do aparelho.
Sem TURN, o WebRTC usa só STUN — chega para a maioria das redes domésticas.

## Arquitetura

```
src/
  routes/          Rotas de página + rotas de API (TanStack Start)
    api/           /api/chat, /api/awaken, /api/voice/*, /api/turn/credentials
  server/          Só servidor: chaves de API vivem aqui e não saem daqui
    ai.ts          Conversa e despertar (validação zod)
    voice.ts       ElevenLabs (clone + TTS)
    turn.ts        Credenciais TURN temporárias (HMAC-SHA1, esquema coturn)
  lib/             Cliente e lógica pura
    ai-client.ts   fetch para /api/* — nunca importa de server/
    store.ts       Estado (zustand + persist)
    mimetic-brain/ Recuperação local BM25F + híbrida, sem servidor
    sensation.ts   Háptica (telefone, gamepad, XR, traje)
    lgpd.ts        Inventário de dados e consentimentos
    ethics.ts      Guardrails do systemPrompt e saída suave
  components/
    world/         Cena 3D (react-three-fiber), navmesh, colisão, avatares
party/             Servidor PartyKit (uma sala por lugar)
```

**Regra do limite servidor/cliente:** `src/lib/**` e `src/components/**` correm no
browser e nunca podem importar de `src/server/**`. As chaves de API são lidas só
em `src/server/**`, atrás das rotas `/api/*`.

## Funcionalidades

### Cérebro mímico

Recuperação local, sem servidor: BM25F (campos com pesos) + cosseno lexical.
Absorve memórias e a fala da presença; recupera os traços relevantes para cada
mensagem e compõe o systemPrompt.

```ts
import { MimeticBrain } from "@/lib/mimetic-brain";

const brain = MimeticBrain.bootstrap(persona);
brain.absorbMemory(memory);
const systemPrompt = brain.composeSystemPrompt("o que ele plantou?");
```

O título de uma memória pesa 3× o corpo; correções da família pesam 2,5×; a fala
da presença pesa menos do que a memória original. A fala do **utilizador** nunca
vira bordão da persona.

Os vetores dos traços não são persistidos: são função pura do texto e ocupavam
82% do espaço guardado. São recalculados ao rehidratar.

### Mundo 3D

- **NavMesh** — A* na grelha + string-pull. Clique no chão traça o caminho;
  WASD/joystick cancela-o.
- **Colisão** — `oliveira` (demo), `simple-room` (medidas), `scan` (GLB),
  `open` (campo de 40 m).
- **Qualidade** — tier detetado (`low`/`mid`/`high`) define sombras, DPR e casters.
- **Avatares** — cápsula procedural, ou GLB do utilizador (Mixamo opcional).

Layouts de lugar: `oliveira-house` · `simple-room` · `scan-glb` · `garden-only`.

### Lugares escaneados

```bash
# Polycam/Scaniverse → GLB → otimizar:
npx @gltf-transform/cli optimize casa.glb public/scans/casa-web.glb \
  --compress draco --texture-compress webp
# /places → "Anexar GLB ao lugar scan" → /scans/casa-web.glb
```

Prefira um `colliderUrl` low-poly; sem ele, o GLB visual é amostrado.

### Multiplayer e voz

`src/lib/realtime.ts` tem três transportes com o mesmo protocolo JSON:
`local` (BroadcastChannel, abas do mesmo browser), `partykit` e `ws` (genérico).

A voz é WebRTC mesh, sinalizada pelo mesmo transporte (`type: "voice"`), com
perfect negotiation e volume espacial por distância (~1,5 m cheio, ~12 m quase
mudo). O áudio é P2P — não passa pelo servidor.

```bash
npx partykit dev      # host local; ligar em /places → Interconexão
npx partykit deploy
```

### TURN

`GET /api/turn/credentials` emite credenciais temporárias
(`username = expiry`, `password = base64(HMAC-SHA1(secret, username))`).
É **same-origin**: recusa pedidos de outras origens, para o relay não ser usado
por terceiros à conta de quem o hospeda.

```bash
export EXTERNAL_IP=$(curl -4 -s ifconfig.me)
export TURN_SECRET=troque_isto
docker compose -f docker-compose.turn.yml up -d
# .env: TURN_URLS=turn:$EXTERNAL_IP:3478 e TURN_SECRET=troque_isto
```

### Sensação (háptica)

`src/lib/sensation.ts` — gestos (mão, ombro, abraço, batimento) sincronizados com
a animação do avatar, por telefone (Vibration API), gamepad, XR ou traje
(protocolo JSON sobre WebSocket, `SUIT_PROTOCOL_DOC`).

Gestos faciais têm o seu próprio caminho (`facial-haptics.ts`) e chegam ao
hardware como regiões do rosto, não como padrão genérico de corpo.

Requer consentimento memorial explícito. Painel em `/places`.

### LGPD e ética

- `src/lib/lgpd.ts` — inventário de tratamentos, bases legais, consentimentos
- `src/lib/ethics.ts` — guardrails no systemPrompt, modo de saída suave, CVV 188
- UI: `/places` → **Privacidade e LGPD**
- Dados locais por defeito; exportação e eliminação na UI

## Estado e próximos passos

Ver [PLANO.md](PLANO.md) — o que foi corrigido, o que ficou por fazer e por que ordem.
