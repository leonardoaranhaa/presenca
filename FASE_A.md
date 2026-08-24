# Fase A — Família no lar (produto mínimo digno)

## Objectivo

Uma família consegue, sem engenheiro:

1. Criar lugar (medidas ou scan)
2. Inserir memorial com consentimento e disclosure
3. Entrar no lar (vivo + memória)
4. Falar e sentir um gesto sem atravessar paredes
5. Sair sem culpa (modo de saída suave)

## Entregas nesta fase (código)

| Item                                                        | Estado               |
| ----------------------------------------------------------- | -------------------- |
| Avatar memorial GLB no mundo (`MemorialBody`)               | ✅                   |
| Fallback GLB → cápsula / simple-room (`GlbErrorBoundary`)   | ✅                   |
| Checklist import scan na UI Lugares (`ScanImportChecklist`) | ✅                   |
| Job ready → `bodyScan` → mundo                              | ✅ (painel + upsert) |
| Validação GLB + docs meshopt (`asset-pipeline`)             | ✅                   |
| MeshoptDecoder no boot do Canvas                            | ✅                   |
| Minutos no mundo + SoftExit no HUD                          | ✅                   |
| Soft exit no chat memorial                                  | ✅ (já existia)      |
| Collider + oclusores + LOD + frustum                        | ✅ (pré-fase A)      |

## Smoke test (mobile / desktop)

- [ ] `/places` — simple-room com medidas; Entrar
- [ ] Andar (WASD / clique no chão); não atravessar parede
- [ ] Persona memorial: conversa ≤ 2,5 m; disclosure visível
- [ ] Avatar: job ready ou GLB manual → corpo no lar
- [ ] Após ~90 min ou muitas msgs: banner “Pausa suave”
- [ ] Voz (opcional) com 2 abas no mesmo lugar
- [ ] Scan GLB (se houver): escala + colisão

## CLI assets

```bash
npx gltf-transform optimize in.glb out.glb --compress meshopt
```

## Fora de âmbito (Fase B+)

LiveKit SFU real · labial neural · traje físico · studio comercial

## Pós-Fase A (seguinte)

- Citações RAG no chat ✅ (`citations` em ChatMessage)
- LiveKit status em `/api/status` ✅
- E2E `e2e/fase-a.spec.ts` ✅

- Gestos/VFX no corpo GLB ✅ (`glb-gesture` + `MemorialBody`)
