# Contribuir

## Arrancar

```bash
nvm use              # Node 22 (ver .nvmrc)
npm install
cp .env.example .env # opcional — sem chaves a app corre em modo degradado
npm run dev          # http://localhost:8080
```

A app arranca sem nenhuma chave de API. O que degrada:

| Sem                  | O que acontece                                              |
| -------------------- | ----------------------------------------------------------- |
| `XAI_API_KEY`        | A conversa responde 503 e a UI avisa. O resto funciona.     |
| `ELEVENLABS_API_KEY` | A presença fala pelo leitor do aparelho (Web Speech API).   |
| TURN                 | WebRTC usa só STUN — chega na maioria das redes domésticas. |
| `VITE_PARTYKIT_HOST` | Multiplayer por BroadcastChannel (abas do mesmo browser).   |

## Antes de abrir um PR

```bash
npm run check   # tipos + lint + testes
npm run build
```

O CI corre exatamente isto, mais `format:check`. Se `npm run check` passa
localmente, o CI passa.

## Regras do projeto

Estão em [`CLAUDE.md`](CLAUDE.md) — servem para pessoas e para agentes. A que
importa mais:

> `src/lib/**` e `src/components/**` correm no browser e nunca podem importar de
> `src/server/**`.

Se a quebrares, o lint e um teste falham, com a explicação.

## Commits

Português, no imperativo, com o contexto do porquê no corpo. Prefixos:
`feat:`, `fix:`, `perf:`, `refactor:`, `docs:`, `test:`, `build:`, `chore:`.

Uma mensagem boa responde a "porque é que isto mudou?", não a "o que mudou?" —
o diff já mostra o quê.

## Dados pessoais

Se o teu PR toca em memórias, voz, scan do corpo, chat ou pose:

1. Atualiza o inventário em `src/lib/lgpd.ts`
2. Confirma que existe uma flag de consentimento em `PrivacyPrefs`
3. Confirma que a exportação e a eliminação continuam a cobrir o dado novo

## Testes

`vitest`, ao lado do que testam (`__tests__/`). O que vale mesmo a pena testar
aqui é a lógica pura — recuperação, colisão, navegação, credenciais, validação
de entrada — e as regressões dos bugs já corrigidos.

Um teste que reproduz o bug antes de o corrigires vale mais do que cinco
escritos depois.
