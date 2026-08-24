# LiveKit SFU — Presença

## Porque

Malha WebRTC (P2P) aguenta ~4–6 pessoas. Acima disso: **SFU**. LiveKit é o caminho de produção.

## Arranque local

```bash
docker compose -f docker-compose.livekit.yml up -d
cp .env.example .env   # se ainda não tiver
# LIVEKIT_URL=ws://127.0.0.1:7880
# LIVEKIT_API_KEY=devkey
# LIVEKIT_API_SECRET=secretsecretsecretsecretsecretsecret

npm i livekit-client
npm run dev
```

## Configuração na app

1. **Ajustes → Interconexão**
2. URL LiveKit: `ws://127.0.0.1:7880` (local) ou `wss://….livekit.cloud` (cloud)
3. Opcional: “Preferir LiveKit mesmo com poucos peers”
4. Guardar SFU / LiveKit

## Fluxo técnico

```
Voz start → peers ≥ 6 ou preferLivekit
  → GET /api/livekit/token?room={placeId}&identity={selfId}
  → livekit-client Room.connect(url, token)
  → publish mic / subscribe áudio remoto
```

Sem `LIVEKIT_API_KEY`/`SECRET` o endpoint responde **503**.

## Produção (LiveKit Cloud)

1. Criar project em https://cloud.livekit.io
2. Copiar URL, API Key, API Secret para o host (nunca no browser)
3. Cliente só precisa da URL `wss://…` em `livekitUrl`

## Fallback

- Sem LiveKit → `sfuUrl` genérico (`SfuVoiceClient`) ou **capped-mesh**
- GLB/avatar e PartyKit continuam independentes da voz SFU

## Active speaker

Com muitos participantes, só os **3** mais activos ficam a volume pleno; os outros
são atenuados (~0.12). Usa `ActiveSpeakersChanged` do LiveKit quando disponível,
senão analyser Web Audio a cada 250 ms.
