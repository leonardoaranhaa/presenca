## O que muda

<!-- Uma ou duas frases. O "porquê" importa mais do que o "o quê" — o diff já mostra o quê. -->

## Porquê

<!-- Que problema resolve. Se corrige um bug, descreve como se reproduzia. -->

## Como verificar

<!-- Passos concretos para quem revê. Ex.: entrar em /world, aproximar-se do Antônio, falar. -->

- [ ] `npm run check` passa (tipos, lint, testes)
- [ ] `npm run build` passa
- [ ] Verificado no browser, se mexe na UI ou no mundo 3D

## Privacidade e ética

<!-- Preencher só se aplicável — apagar a secção se não mexe em nada disto. -->

- [ ] Mexe em dados pessoais (memórias, voz, scan do corpo, chat) → `src/lib/lgpd.ts` atualizado
- [ ] Mexe no que a presença diz de si → `src/lib/ethics.ts` revisto
- [ ] Nenhuma chave de API atravessa o limite `src/server` → `src/lib`
