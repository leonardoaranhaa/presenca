# Presença — plano de ação

Avaliação da solução recebida (desenvolvida no Grok), o que foi corrigido nesta
passagem e o que falta, por ordem de prioridade.

O commit `b54afca` é a solução **como recebida**. Tudo o que vem depois é a
refatoração — o diff entre os dois é a lista completa de mudanças.

---

## 1. Diagnóstico

A ideia e o desenho de produto estão bem: a distinção mímica/pessoa é levada a
sério e atravessa o código (ética, LGPD, texto da UI), a modelação de domínio é
coerente e o mundo 3D tem peças reais (A*, string-pull, grelha de ocupação,
tiers de qualidade). O problema não era o desenho — era que **nada disto tinha
sido executado**.

Sintoma central: o pacote não compilava nem arrancava. Faltava `vite.config.ts`,
o `routeTree.gen.ts` era `export const routeTree = {} as any`, e o `tsc` acusava
20 erros — ou seja, o código nunca correu como um todo. O padrão típico de
código gerado por conversa: cada peça foi escrita a olhar para si própria, e as
juntas nunca foram testadas.

### Os quatro problemas que valiam mais do que os outros

**1. A conversa nunca funcionou, em ambiente nenhum.**
`lib/ai.ts` lia `process.env.XAI_API_KEY` e chamava `api.x.ai`, mas era
importado por `presence-chat.tsx` e `memory-vault.tsx`, que correm no browser.
No browser `process` é `undefined`, portanto a função devolvia sempre
_"A voz da presença não está disponível neste ambiente"_. A funcionalidade
central da app estava morta — e se algum bundler fizesse shim de `process.env`,
a chave da API ia para o bundle do cliente.

Agravante: as rotas em `src/routes/api/**` exportavam `POST`/`GET`/`default`,
um formato que o TanStack Start não reconhece. Nenhuma entrava no routeTree, e
`/api/*` respondia 404 — por isso o TTS, o clone de voz e o TURN também estavam
mortos.

**2. O mundo 3D re-renderizava ~8 vezes por segundo.**
`qualityProfile()` construía um objeto novo a cada chamada e era usada dentro de
seletores zustand (`experience`, `house`, **cada** `Figure`, `places`). A
comparação por identidade falhava sempre, portanto qualquer escrita no store
re-renderizava a cena inteira. E o mundo escrevia a pose no store a cada 120 ms
de propósito, só para `publishPose` a poder ler.

**3. Metade das ligações de voz nunca estabelecia.**
Só quem entrava difundia `voice-join`. Quem já estava na sala criava a ligação,
mas o papel vinha de `selfId < peerId` e o lado _polite_ esperava por uma oferta
que nunca chegava — quem acabara de entrar nem sabia que aquele peer existia.

**4. O cérebro mimético corrompia a persona.**
`bumpTraits` recolhia "bordões" de qualquer texto, incluindo o que o
**utilizador** escrevia. A persona herdava as frases de quem falava com ela —
exatamente o inverso de mimetizar quem partiu. E `skillEvolve` nunca evoluía:
um `||` curto-circuitava e o resumo ficava congelado depois da primeira memória.

---

## 2. Feito nesta passagem

| #   | Área            | Correção                                                                                                                          |
| --- | --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Build           | `vite.config.ts`, routeTree gerado, `@types/node`, `noUnusedLocals`, plugin-react 6 (peer do Vite 8)                              |
| 2   | Tipos           | 20 erros de `tsc`, incluindo 5 `useEffect` que devolviam `boolean` (`Set.delete`) e o `<line>` que resolvia para `SVGLineElement` |
| 3   | **Arquitetura** | `lib/ai.ts` → `server/ai.ts`; rotas `/api/chat` e `/api/awaken`; `lib/ai-client.ts` para o browser; `lib/voice-api.ts` removido   |
| 4   | **Arquitetura** | As 5 rotas de API convertidas para `createFileRoute` + `server.handlers` — agora existem em runtime                               |
| 5   | Performance     | `qualityProfile` memoizado; `publishPose(pose)` por argumento; `experience` deixa de subscrever a pose                            |
| 6   | Voz             | `voice-here` no protocolo; perfect negotiation com rollback; sem oferta duplicada; sem `RTCPeerConnection` duplicada              |
| 7   | PartyKit        | Reescrito sobre `Party.Server`; `voice` no tipo `Msg`; entrega dirigida; limpeza de peers mortos                                  |
| 8   | Cérebro         | Bordões só de memórias e da própria presença; `topKHybrid` deixa de ser O(n²); resumo derivado e limitado                         |
| 9   | Persistência    | Vetores não persistidos (82% do peso, funções puras do texto): 1,21 MB → 0,21 MB com 4 personas                                   |
| 10  | Persistência    | Quota estourada deixa de falhar em silêncio (`isStorageFull()`)                                                                   |
| 11  | **Segurança**   | `/api/turn/credentials` era `Access-Control-Allow-Origin: *` sem verificação — relay aberto ao mundo. Agora same-origin           |
| 12  | Comportamento   | Persona mais próxima medida contra a posição viva, não o spawn; `approach` deixa de ser sempre verdadeiro                         |
| 13  | Fugas           | Object URL do TTS, subscrição do transporte, `srcObject` dos peers                                                                |
| 14  | Completado      | Gestos faciais chegam ao traje como regiões do rosto; nomes dos peers renderizados; `preferredCheek: "both"`                      |
| 15  | Testes          | 50 casos (vitest), incluindo um guarda do limite servidor/cliente que falha se a regressão #3 voltar                              |

Estado: `npm run typecheck` limpo · `npm test` 50/50 · `npm run build` ok ·
`/api/*` verificado com o servidor a correr (200 no TURN, 503 sem chave de IA,
400 com corpo inválido).

---

## 3. Por fazer, por ordem

### Curto prazo — antes de mostrar a alguém de fora

**3.1 · Migrar as media do cofre para IndexedDB.**
É a próxima falha certa. As fotos são guardadas como data URLs em localStorage:
~116 KB cada depois de comprimidas e convertidas para base64. Com ~40 fotos a
quota de 5 MB estoura, e o cofre de memórias é precisamente o sítio onde uma
família vai pôr muitas fotos. O `isStorageFull()` já avisa, mas avisar não
resolve. IndexedDB guarda `Blob` sem base64 (–27%) e tem quota na ordem das
centenas de MB. Manter o localStorage só para o estado leve.

**3.2 · Verificar o consentimento no servidor, não só na UI.**
`requestVoiceClone` verifica `input.consent` no cliente, mas `/api/voice/clone`
aceita qualquer pedido. Para dado biométrico sob LGPD, o consentimento tem de
ser verificável do lado de quem trata. Passar o registo de consentimento no
corpo e recusar sem ele.

**3.3 · Limitar a taxa de `/api/chat` e `/api/awaken`.**
Sem autenticação e sem limite, quem descobrir o endpoint gasta a quota de IA de
quem hospeda. `awaken` aceita 3 imagens por pedido — é o caro.

**3.4 · Decidir o alvo de deploy.**
`npx vite build` produz `dist/server/server.js`, que não é um servidor que
escute — é o handler. Falta escolher o preset de deploy (Node, Vercel, Netlify)
e verificar que `/api/*` responde em produção, não só em dev.

### Médio prazo — o que decide se o produto se aguenta

**3.5 · Um "lar" que sobrevive ao dispositivo.**
Hoje tudo é local-first, o que é uma boa escolha de privacidade e a escolha
errada para a promessa do produto: _a família continua junta_. Limpar os dados
do browser apaga o avô. E duas pessoas da mesma família, em telefones
diferentes, não veem o mesmo lar — só se cruzam em tempo real se estiverem
ligadas ao mesmo tempo.

Isto é uma decisão de produto, não técnica, e é a maior que está em aberto:
sincronização opcional com cifra do lado do cliente mantém a promessa de
privacidade sem perder a permanência. Convém decidir antes de haver utilizadores
com dados a sério.

**3.6 · Recuperação semântica a sério.**
O BM25F está bem feito e é honesto. O "vetor" é que não: 64 dimensões com hash
FNV colide muito, e o cosseno sobre isso acrescenta pouco ao BM25F — é ranking
lexical com um nome mais ambicioso. Perguntar _"ele gostava de plantas?"_ não
recupera a memória da goiabeira, porque nenhuma palavra coincide. Um modelo de
embeddings pequeno via `transformers.js` mantém tudo local e resolve isto.

**3.7 · Testes do que não é lógica pura.**
Os 50 casos cobrem BM25F, cérebro, colisão, TURN e validação de API. Falta o
que quebra na prática: o handshake WebRTC (dois `VoiceChat` com um transporte
falso — daria para reproduzir o deadlock #3), o store com persistência, e um
smoke test de browser que entra no mundo e fala com alguém.

**3.8 · Orçamento de performance do mundo.**
As figuras são meshes individuais com materiais próprios — uma draw call por
membro, por persona. Com 8 personas em `low` isto pesa. Instancing ou geometria
partilhada resolve. Medir antes de otimizar: o problema das 8 re-renderizações
por segundo era muito maior e já saiu.

### Quando houver utilizadores reais

**3.9 · Fechar a checklist LGPD.** `LEGAL.md` tem-na: política revista por
advogado, DPO e canal de pedidos, contratos com os operadores (ElevenLabs,
hosting, PartyKit), e eliminação também do lado do servidor quando houver conta.

**3.10 · Rever os guardrails com quem percebe de luto.** `ETHICAL_GUARDRAILS` e
o modo de saída suave estão escritos com cuidado, mas os limiares
(25 mensagens, 90 minutos) foram escolhidos sem base. Vale uma revisão de quem
trabalha com luto — e é barato mudar, são constantes num sítio só.

---

## 4. Notas sobre o fornecedor de IA

O `grok-4.5` existe e o endpoint está correto. A camada é compatível com o
formato OpenAI, portanto trocar de fornecedor é mudar `API_URL`, o header de
autenticação e `model()` em `src/server/ai.ts` — o resto do código não sabe quem
responde. O modelo é configurável por `XAI_MODEL` sem tocar no código.

Mantive o xAI porque foi a escolha original. Se o objetivo for reduzir o custo
das conversas longas, o ponto a olhar primeiro é o systemPrompt: é recomposto a
cada mensagem e é grande (perfil + traços recuperados + guardrails). Cache de
prompt, onde o fornecedor a suporte, corta a maior parte disso.
