# Presença — notas para o Claude Code

Lar virtual onde a família continua junta: vivos, lugares reais e memoriais.
TanStack Start + React Three Fiber, local-first.

## Comandos

```bash
npm run dev          # servidor de desenvolvimento, porta 8080
npm run check        # tipos + lint + testes (correr antes de commit)
npm run build        # build de produção (Nitro → .output/)
npm test             # vitest
npm run lint:fix     # corrige o que dá
npm run format       # prettier
```

`npm run build` gera `src/routeTree.gen.ts`. É ignorado pelo git de propósito —
não o editar nem versionar.

## A regra que não se quebra

**`src/lib/**` e `src/components/**` correm no browser e nunca podem importar de
`src/server/**`.**

As chaves de API (`XAI_API_KEY`, `ELEVENLABS_API_KEY`, `TURN_SECRET`) são lidas
só em `src/server/**`, atrás das rotas `/api/*`. O cliente fala com essas rotas
por `fetch` (`src/lib/ai-client.ts`, `src/lib/voice.ts`, `src/lib/ice-config.ts`).

Isto não é preferência de estilo: foi o bug mais caro do projeto. `lib/ai.ts`
lia `process.env` e era importado por componentes do browser, onde `process` é
`undefined` — a conversa, funcionalidade central da app, nunca funcionou em
ambiente nenhum, e a chave arriscava ir para o bundle do cliente.

Guardado em dois sítios, ambos falham se a regra for quebrada:

- `eslint.config.js` → `no-restricted-imports`
- `src/lib/__tests__/boundaries.test.ts`

Corolário: nada com prefixo `VITE_` pode conter um segredo. Tudo o que começa
por `VITE_` é embebido no bundle do browser.

## Rotas de API

TanStack Start regista rotas de API por `createFileRoute` + `server.handlers`:

```ts
export const Route = createFileRoute("/api/chat")({
  server: { handlers: { POST: ({ request }) => handleChat(request) } },
});
```

Exportar `POST`/`GET`/`default` de um ficheiro em `src/routes/api/**` **não
funciona** — o ficheiro não entra no routeTree e a rota responde 404, em
silêncio. Já aconteceu com as cinco rotas.

## Mapa

```
src/
  routes/          páginas + rotas de API
  server/          só servidor — chaves vivem aqui
  lib/             cliente e lógica pura
    mimetic-brain/ recuperação BM25F + híbrida, local, sem servidor
  components/world/ cena 3D: navmesh (A*), colisão, avatares, háptica
party/             servidor PartyKit — uma sala por lugar
```

## Convenções

- **Português** em código, comentários, commits e UI. O domínio é português e a
  UI também; misturar idiomas torna o código mais difícil de ler, não menos.
- Comentários explicam **porquê**, não o quê. Um comentário que descreve a linha
  a seguir é ruído; um que explica uma decisão não óbvia poupa uma hora.
- `src/components/world/**` é react-three-fiber: mutar objetos Three.js dentro
  de `useFrame` é o padrão correto, alocar por frame é que não é. As regras do
  React Compiler estão como aviso aí por esta razão (ver `eslint.config.js`).
- Seletores zustand têm de devolver referências estáveis. Devolver um objeto
  novo re-renderiza a cada escrita no store — já custou ~8 re-renders/segundo
  da cena inteira.

## Ética e privacidade — não é opcional

A presença é **mímica**: imita o jeito e as memórias que a família confia, e diz
isso quando lhe perguntam. Não é a pessoa e não finge ser.

- `src/lib/ethics.ts` — guardrails que entram no systemPrompt, modo de saída
  suave, CVV 188. Mudar isto exige pensar, não só editar.
- `src/lib/lgpd.ts` — inventário de tratamentos e bases legais. Todo o
  tratamento novo de dados pessoais entra no inventário.
- Voz clonada e scan do corpo são dados sensíveis: exigem consentimento
  explícito.

## Estado do projeto

`PLANO.md` tem o diagnóstico, o que está feito e o que falta por ordem.
Antes de começar trabalho novo, ver se já lá está.
