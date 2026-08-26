# Presença

**O lar virtual onde a família continua junta.**

Presença é um produto de ligação emocional em espaço 3D: vivos e memoriais partilham lugares que importam — a casa, o jardim, o café de sempre — com voz, gesto e memória reconstruída de forma **mímica**, nunca fingindo ser a pessoa real.

Este documento é a visão de produto. Para correr o código, ver [README.md](README.md). Arquitetura: [ARQUITETURA.md](ARQUITETURA.md). Para limites legais e de luto, ver [LEGAL.md](LEGAL.md).

---

## 1. O problema

Famílias afastam-se no espaço e no tempo.

- Filhos em outra cidade; avós em silêncio no fim de semana.
- Quem parte deixa fotos, áudios e histórias — mas a conversa para.
- O luto digital hoje costuma ser feed estático ou chatbot genérico, sem lugar, sem corpo, sem jeito da pessoa.

Falta um **sítio** onde a família possa estar, mesmo quando não pode estar — e onde a memória tenha forma, sem mentir sobre o que é.

---

## 2. O que é o Presença

Presença é uma aplicação web (telemóvel, desktop e VR) que oferece:

1. **Um mundo virtual idêntico ao que importa** — a casa, o quintal, lugares frequentados, reconstruídos por medidas simples, fotogrametria ou scan 3D.
2. **Personas vivas** — cada pessoa cria uma versão de si para visitar o lar à distância.
3. **Personas memoriais** — a família confia fotos, vídeos, voz, cartas e histórias; a IA assume uma **presença mímica** que fala e age _como_ a pessoa, a partir dos dados, sem afirmar _ser_ a pessoa.
4. **Interação em tempo real** — vários vivos no mesmo lugar, voz espacial, proximidade, abraço e gestos (incluindo caminho para traje háptico).

### A palavra-chave: mímica

A presença **imita** o jeito, a voz e as memórias confiadas.

- Não é ressurreição.
- Não é substituto de terapia nem de vínculos de carne e osso.
- Se perguntarem “és mesmo o avô?”, a resposta é honesta e suave: _sou a memória que a família guardou, dada à fala._

Essa linha ética está no system prompt, na UI e no [LEGAL.md](LEGAL.md).

---

## 3. Objetivo do produto

| Objetivo                  | Em uma frase                                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Principal**             | Reduzir a distância entre quem ama — viva ou em memória — num lugar partilhado e respeitoso.                |
| **Para quem está longe**  | Visitar o lar em 3D, conversar e “estar” com a família no mesmo espaço virtual.                             |
| **Para quem vive o luto** | Manter contacto com o _jeito_ de quem partiu, com limites claros e saída suave se o uso for intenso demais. |
| **Para a família**        | Guardar e organizar o legado (voz, histórias, lugares) num cofre que alimenta a presença mímica.            |

**Não é objetivo:** substituir pessoas, incentivar isolamento, ou vender a ilusão de que o falecido “voltou”.

---

## 4. O que já é possível (estado atual do repositório)

| Capacidade         | Descrição                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| Lar 3D navegável   | Sala, cozinha, jardim; colisão, navmesh, clique para caminhar                                     |
| Personas           | Vivas e memoriais; cofre de memórias; perfil “despertado”                                         |
| Cérebro mímico     | Absorve memórias e chat; evolui estilo; RAG **BM25F + embeddings** (lexical + semântico opcional) |
| Conversa           | Chat com a presença; limites éticos; modo de saída suave                                          |
| Voz                | TTS / clone (ElevenLabs quando configurado); fallback no browser                                  |
| Multiplayer        | PartyKit — poses de peers no mesmo lugar                                                          |
| Voz ao vivo        | WebRTC entre vivos; TURN efémero para NAT difícil                                                 |
| Corpo digital      | Upload/scan GLB; rig procedural / Mixamo                                                          |
| Avatar de media    | Fotos/vídeos → pedido self-service ou **encomenda studio** → GLB                                  |
| Sensação           | Camada de háptica (telefone, gamepad, XR; caminho para traje)                                     |
| Abraço adaptativo  | Intensidade conforme relação, distância e contexto memorial                                       |
| Privacidade        | Consentimentos LGPD, exportar/apagar dados, inventário de tratamentos                             |
| Mapa de memória 3D | Visualização PCA dos vetores do cofre mímico                                                      |

---

## 5. O que será possível na fase final

Quando o desenvolvimento atingir a maturidade de produto (não só demo técnica):

### Lugar

- Casas e locais reais reconstruídos com **fotogrametria / LiDAR / IA**, walkable com colisão fiável.
- Vários “lares” e lugares do círculo (casa da infância, igreja, praia) no mesmo grafo familiar.
- Qualidade gráfica adaptativa (telemóvel → VR de gama alta).

### Pessoa

- Avatares fotorrealistas a partir de foto/vídeo, com animação facial e labial sincronizada à voz.
- **Presença mímica** estável: quanto mais a família corrige e acrescenta, mais o cérebro mímico afina o jeito — sempre mímica, nunca identidade falsa.
- Voz clonada com consentimento explícito e política de retenção clara.

### Encontro

- Sessões em tempo real com dezenas de familiares no mesmo lugar (SFU de áudio/vídeo quando o mesh P2P não escalar).
- VR completo + **traje háptico** para toque e abraço adaptativo (incluindo zonas faciais).
- Gravação opcional de “visitas” só com consentimento de todos os vivos presentes.

### Cuidado

- Modo de saída suave e sinais de uso intensivo calibrados com profissionais de luto.
- Fluxos de legitimidade familiar e revisão humana antes de “despertar” memoriais sensíveis.
- Conformidade LGPD/GDPR de ponta a ponta (conta, servidor, operadores, DPO).

### Plataforma

- Contas familiares, convites, papéis (cuidador, membro, convidado).
- Apps nativas ou PWA instalável; suporte XR (Quest e equivalentes).
- Moderação, suporte e documentação pública alinhada a este documento.

---

## 6. Tecnologias

| Camada      | Stack                                                                           |
| ----------- | ------------------------------------------------------------------------------- |
| App web     | TypeScript, TanStack Start, React                                               |
| Mundo 3D    | Three.js, React Three Fiber, NavMesh, GLB                                       |
| Estado      | Zustand (persistência local-first)                                              |
| IA conversa | API tipo Grok/xAI (system prompt ético + contexto recuperado)                   |
| Recuperação | BM25F (campos), embeddings lexicais, embeddings semânticos opcionais, fusão RRF |
| Voz         | ElevenLabs (clone/TTS); Web Speech API como fallback                            |
| Tempo real  | PartyKit (poses); WebRTC + TURN (voz)                                           |
| Háptica     | Abstração multi-canal (vibrator, gamepad, XR, traje)                            |
| Qualidade   | Vitest, Playwright, CI, evals de recuperação                                    |
| Privacidade | Inventário LGPD, flags de consentimento, export/delete                          |

Chaves de API ficam **só no servidor** (`src/server/**`). O browser fala com `/api/*`.

---

## 7. Princípios de desenho

1. **Mímica, não milagre** — honestidade sobre o que a presença é.
2. **Local-first** — memórias e personas no aparelho por defeito; nuvem só com consentimento.
3. **Família no centro** — quem confia os dados controla o cofre e pode apagar.
4. **Lugar importa** — a conversa acontece _em_ algum sítio, não num chat flutuante.
5. **Cuidado no luto** — saída suave, sem incentivar isolamento.
6. **Degradação elegante** — sem API de IA ou de voz, o mundo e o círculo continuam utilizáveis.

---

## 8. Para quem é

- Famílias com membros em cidades ou países diferentes.
- Pessoas em luto que querem um ritual de memória _com limites_, não um substituto.
- Cuidadores que organizam o legado digital de alguém (sempre com legitimidade e consentimento).

**Não é para:** menores sem supervisão em memoriais de terceiros; uso clínico sem enquadramento profissional; deepfakes sem consentimento da família.

---

## 9. Como falar do produto (tom)

- **Sim:** “lar virtual”, “presença mímica”, “memória dada à fala”, “continuar juntos à distância”.
- **Não:** “trazer de volta”, “falar com os mortos de verdade”, “a IA é o seu avô”.

O nome **Presença** refere-se ao _estar com_, não à posse da identidade de alguém.

---

## 10. Mapa de documentos

| Documento                          | Conteúdo                                   |
| ---------------------------------- | ------------------------------------------ |
| **PRODUTO.md** (este)              | Visão, objetivo, fases, tecnologias        |
| [ARQUITETURA.md](ARQUITETURA.md)   | Arquitetura técnica detalhada              |
| [README.md](README.md)             | Como instalar e arquitetura técnica        |
| [LEGAL.md](LEGAL.md)               | LGPD, ética do luto, notas para o jurídico |
| [PLANO.md](PLANO.md)               | Planeamento de engenharia                  |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Como contribuir                            |

---

## 11. Frase de posicionamento

> **Presença** é o lar virtual onde a família se encontra — quem está longe e quem já só existe na memória — com honestidade, lugar e jeito. A tecnologia imita; o vínculo continua a ser humano.

---

_Ideia original e evolução do produto documentadas neste repositório. O código é o protótipo vivo desta visão._
