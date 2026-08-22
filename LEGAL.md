# Presença — notas para o jurídico (LGPD e ética)

Documento operacional. **Não substitui parecer jurídico.**

## Princípios de desenho

1. **Local-first**: personas, memórias e chat residem no dispositivo por defeito.
2. **Consentimento por feature**: flags em `PrivacyPrefs` desligam fluxos sem reescrever o core.
3. **Versionamento de política**: `POLICY_VERSION` — ao mudar, novo aceite.
4. **Inventário**: `DATA_INVENTORY` em `src/lib/lgpd.ts` lista finalidades, bases e retenção.
5. **Dados sensíveis**: voz (clone) e body scan tratados com opt-in explícito.
6. **Memorial**: declaração de legitimidade familiar (`memorialFamilyAuthority`).

## Direitos do titular (art. 18 LGPD)

| Direito | Implementação atual |
|---------|---------------------|
| Acesso / portabilidade | Exportar JSON local |
| Eliminação | Apagar dados locais |
| Revogação de consentimento | Toggles de privacidade |
| Informação | Aviso + inventário na UI |

## Impasses futuros — mudanças mínimas

| Pedido jurídico | Onde mudar |
|-----------------|------------|
| Novo texto de política | `PRIVACY_NOTICE_SHORT` + `POLICY_VERSION` |
| Desligar clone de voz | default `allowVoiceClone: false` (já) |
| Proibir scan de menores | validação na UI de body + termos |
| Retenção máxima de chat | limpar `messages` por idade no store |
| Base legal diferente | campo `basis` no inventário |
| DPO / canal de contacto | acrescentar email no painel |

## Presença mímica (conceito)

A IA e o avatar **mimetizam** (imitam) traços, voz e histórias fornecidos pela família.
Não são a pessoa falecida. Esta distinção deve constar em Termos, UI e system prompt.

## Ética do luto

- System prompt: `ETHICAL_GUARDRAILS` (`src/lib/ethics.ts`)
- A presença é **mímica**; **não** afirma ser a pessoa real
- **Não** incentiva isolamento
- **Modo de saída suave** após uso intenso (contadores locais)
- CVV 188 referido no banner

## Terceiros

- ElevenLabs (voz): só com `allowVoiceClone`
- PartyKit / TURN: pose e sinalização; áudio WebRTC é P2P
- Modelos de IA: dependem do backend de `chatWithPresence`

## Checklist antes de produção BR

- [ ] Política de Privacidade e Termos revisados por advogado
- [ ] Encarregado (DPO) e canal de pedidos
- [ ] Registro de operações (inventário alinhado ao produto real)
- [ ] RIATR se legítimo interesse for usado
- [ ] Contrato com operadores (ElevenLabs, hosting, PartyKit)
- [ ] Fluxo de exclusão também no servidor (quando houver conta)
