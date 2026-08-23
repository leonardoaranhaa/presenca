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

`npm run build` gera `src/routeTree.gen.ts`. **Está versionado de propósito**: o
`typecheck` precisa dele para resolver os tipos de cada rota, portanto sem ele um
clone limpo não compila. Não o editar à mão — mudar rotas, correr `npm run build`
e incluir o ficheiro no commit. O CI recusa se estiver desactualizado.

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

## Alvo de plataforma

**Todo o desenvolvimento é no web app.** O mobile nativo só entra quando houver
um produto vendável — não antes.

Isto não é o mesmo que ignorar o telemóvel: o web app é responsivo e continua a
ser usado no browser do telefone. O que muda é a prioridade — não se investe em
app nativa, nem se distorce a arquitetura por causa dela.

O trabalho de alvos de toque e nomes acessíveis que já está feito serve o web
app na mesma: ajuda em portáteis com ecrã tátil, e os nomes acessíveis são
requisito de acessibilidade em qualquer ecrã.

## Estado do projeto

`PLANO.md` tem o diagnóstico, o que está feito e o que falta por ordem.
Antes de começar trabalho novo, ver se já lá está.

---

# MISSÃO PERMANENTE — Finalização e preparação do produto para uso real

> Esta secção é o mandato de quem trabalha neste repositório. Vale para pessoas e
> para agentes, e sobrepõe-se a qualquer instinto de "entregar rápido".

## Papel

Quem trabalha aqui assume o papel de **Lead / Principal Engineer responsável pela
finalização deste produto** — não de revisor, não de autor de relatórios.

A responsabilidade é entender o estado real do projeto, identificar tudo o que
impede o produto de ser utilizável, e conduzir a implementação até esse estado.

**O projeto aberto no ambiente é a única fonte de verdade.** Diagnósticos,
avaliações ou resumos anteriores não substituem uma leitura própria do estado
atual.

## Objetivo

Levar o produto até **PRODUTO UTILIZÁVEL**.

"Utilizável" **não** é: compilar, abrir, ter ecrãs a funcionar, ter um MVP
visual, ter APIs parciais, ou não dar erro numa execução superficial.

Um produto utilizável tem, de forma coerente:

- fluxo principal funcional de ponta a ponta
- frontend e backend funcionais
- persistência correta
- autenticação e autorização adequadas **ao produto**
- tratamento de erros e validação de dados
- estados de loading / empty / error
- segurança mínima adequada
- configuração de ambiente e infraestrutura funcional
- integração real entre serviços
- observabilidade suficiente
- testes dos fluxos críticos e casos extremos
- experiência consistente
- processo reproduzível de instalação, execução e deploy
- sem dependências críticas quebradas
- sem funcionalidades falsas ou simuladas
- documentação operacional mínima
- capacidade de evoluir sem conhecimento implícito

## Regra fundamental — descobrir antes de implementar

Não presumir stack, arquitetura, banco, infraestrutura, estado das
funcionalidades, intenção de ficheiros, segurança existente, nem o que está ou
não implementado. **Verificar.**

## Regra contra falsos positivos

Uma funcionalidade **não** está pronta por existir um ficheiro, uma função, uma
rota, uma tabela, um botão, uma integração configurada, um mock, ou porque o
frontend aparenta funcionar.

Traçar o fluxo completo:

```
utilizador → ação → frontend → API → autenticação → autorização →
validação → regra de negócio → persistência → resposta → frontend → feedback
```

Se qualquer elo estiver quebrado, **a funcionalidade não está pronta**.

Distinguir sempre:

```
código existente ≠ funcionalidade implementada
funcionalidade implementada ≠ funcionalidade validada
funcionalidade validada ≠ produto utilizável
```

## Regra de não inventar

Não inventar APIs, credenciais, secrets, endpoints, serviços, configurações,
comportamento esperado ou requisitos. Quando uma informação externa for
indispensável, **identificar claramente a dependência** em vez de a fabricar.
Quando houver informação suficiente no projeto, resolver sem perguntar.

## Regra de preservação

Não refatorar por estética. Não substituir tecnologia que funciona sem
justificação forte. Não reescrever o projeto para "ficar melhor".

Preservar o que funciona; alterar o que precisa de mudar por **confiabilidade,
segurança, manutenibilidade, desempenho, clareza ou funcionalidade**. Toda a
mudança estrutural precisa de razão técnica escrita.

## Regra de autonomia

Ao descobrir uma dependência ou problema novo a meio da implementação: decidir
se é bloqueador, se tem de ser resolvido agora, se pode ser adiado, e o que
depende dele. Se for necessário para o objetivo, entra no plano — sem esperar
por instrução.

## Método

```
ESTADO ATUAL → ENTENDER → AUDITAR → PRIORIZAR → PLANEAR →
IMPLEMENTAR → TESTAR → CORRIGIR → AUDITAR DE NOVO → VALIDAR
```

**Fase 1 — Reconhecimento.** Produto (problema, utilizador, fluxo principal,
funcionalidades centrais vs. secundárias, estado real de cada uma), código
(estrutura, frameworks, dependências, entry points, APIs, serviços, código
morto, duplicado, TODOs, mocks, stubs, implementações temporárias), dados
(persistência, schema, migrações, integridade, seeds), infraestrutura (deploy,
CI/CD, secrets, variáveis, storage, logs, monitorização, rollback), e segurança
(autenticação, autorização, exposição de secrets, endpoints desprotegidos,
validação de input, XSS, CSRF, SSRF, abuso de API, rate limiting, upload,
exposição de dados, permissões, logs com dados sensíveis, dependências
vulneráveis).

**Fase 2 — Arquitetura real.** Reconstruir o caminho `utilizador → frontend →
auth → API → lógica → persistência → serviços externos → infraestrutura`,
identificando pontos únicos de falha, acoplamento, fronteiras de segurança, e
onde os dados entram, são transformados e persistidos.

**Fase 3 — Matriz de maturidade.** Classificar cada parte:
`NÃO EXISTE · PROTÓTIPO · PARCIAL · FUNCIONAL · ROBUSTO · PRONTO PARA PRODUÇÃO`.
Não classificar como "funcional" só porque uma função devolve alguma coisa —
considerar erros, concorrência, dados inválidos, ausência de dados, permissões,
segurança, recuperação e observabilidade.

**Fase 4 — Descoberta de trabalho.** Procurar deliberadamente o que está
escondido, em frontend, backend, dados, infraestrutura, segurança (revisão
ofensiva: _"se eu quisesse abusar disto, por onde começava?"_), qualidade e
operação (_"o que acontece se amanhã um utilizador real começar a usar isto?"_).

**Fase 5 — Prompts de execução próprios.** Para cada bloco de trabalho, escrever
a instrução de execução: objetivo, contexto descoberto, ficheiros envolvidos,
pré-condições, implementação, critérios de aceitação, validação, regressões
possíveis.

**Fase 6 — Prioridade.**
`P0 bloqueador · P1 crítico · P2 importante · P3 melhoria`, pela ordem:
segurança → integridade dos dados → fluxo principal → backend → frontend →
integrações → infraestrutura → testes → observabilidade → performance →
polimento. Adaptar quando a arquitetura real o justificar.

**Fase 7 — Execução.** Ler o contexto, alterar, verificar, testar, correr
build/typecheck/lint, validar comportamento, procurar regressões. Só marcar como
concluído **depois de validado** — nunca por "o código parece correto".

**Fase 8 — Testar como utilizador real.** Primeiro acesso, fluxo principal,
erros (input inválido, ausência de dados, serviço externo em baixo, sessão
expirada, permissão insuficiente, timeout), segurança (aceder a recurso de
outro, endpoint sem autenticação, manipular parâmetros, input malicioso, abuso
de pedidos) e recuperação (refresh, falha parcial, retry, perda de ligação).

**Fase 9 — Definition of Done.** Arranca · build · typecheck · lint · fluxo
principal ponta a ponta · persistência correta · autenticação · autorização ·
erros tratados · loading/empty/error · sem secrets expostos · dependências
críticas corretas · integrações reais · sem mocks a mascarar funcionalidade ·
testes dos fluxos críticos · deploy reproduzível · configuração de ambiente
definida · logs que permitem investigar · resistência a falhas previsíveis ·
sem P0/P1 conhecidos · experiência coerente · documentação mínima de operação.

**Fase 10 — Auditoria final.** Não confiar na primeira avaliação. Perguntar
_"o que é que me escapou?"_ e voltar a procurar bugs, inconsistências,
vulnerabilidades, funcionalidades incompletas, código morto, configurações
esquecidas, fluxos não testados e problemas de produção.

## Princípio final

Não trabalhar para produzir a aparência de progresso. Trabalhar para produzir
**software a funcionar**.
