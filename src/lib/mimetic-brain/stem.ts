/**
 * Radicalização para português.
 *
 * O tokenizador tratava "plantas" e "plantou" como palavras sem relação
 * nenhuma, e "netos" nunca encontrava "neta". Numa app onde a família pergunta
 * *"ele gostava de plantas?"* sobre alguém que **plantou** uma goiabeira, isso
 * não é uma perda de ranking: o BM25 dá zero, o filtro de sinal deixa cair o
 * documento, e a presença responde como se não soubesse.
 *
 * Não é o RSLP completo — é a parte produtiva dele, na ordem que interessa:
 * plural → aumentativo/diminutivo → verbo → nome. Cada regra tem um tamanho
 * mínimo de radical, que é o que impede o algoritmo de destruir palavras
 * curtas.
 *
 * **Radicalizar a mais é pior do que a menos.** Num memorial, uma memória
 * recuperada por engano faz a presença "lembrar-se" de algo que não é da
 * pessoa. Por isso os mínimos são conservadores e há uma lista de invariáveis.
 */

/** Palavras que não se radicalizam — curtas, irregulares, ou nomes próprios comuns. */
const INVARIAVEIS = new Set([
  "casa",
  "casas",
  "pais",
  "mais",
  "menos",
  "deus",
  "voz",
  "vez",
  "vezes",
  "luz",
  "paz",
  "mes",
  "mar",
  "cor",
  "dor",
  "flor",
  "amor",
  "sol",
  "mao",
  "maos",
  "pao",
  "paes",
]);

/** Plural → singular. As excepções vêm antes da regra geral do -s. */
const PLURAL: [RegExp, string, number][] = [
  [/ões$/, "ao", 3],
  [/ães$/, "ao", 3],
  [/ãos$/, "ao", 3],
  [/oes$/, "ao", 3],
  [/aes$/, "ao", 3],
  [/aos$/, "ao", 3],
  [/ais$/, "al", 3],
  [/eis$/, "el", 3],
  [/óis$/, "ol", 3],
  [/ois$/, "ol", 3],
  [/is$/, "il", 3],
  [/ns$/, "m", 3],
  [/res$/, "r", 4],
  [/zes$/, "z", 4],
  [/ses$/, "s", 4],
  [/s$/, "", 3],
];

/**
 * Aumentativo e diminutivo — muito usados em conversa de família.
 *
 * `-inho` devolve a vogal do original (`netinha` → `neta`, `livrinho` →
 * `livro`); `-zinho` não (`cafezinho` → `cafe`). Sem esta distinção o
 * diminutivo não encontrava a palavra de que veio.
 */
const GRAU: [RegExp, string, number][] = [
  [/zinh[oa]$/, "", 3],
  [/inh([oa])$/, "$1", 4],
  [/zit[oa]$/, "", 3],
  [/it([oa])$/, "$1", 5],
  [/zã[oa]$/, "", 3],
  [/ã([oa])$/, "$1", 5],
  [/aç([oa])$/, "$1", 5],
];

/**
 * Sufixos que formam nomes a partir de outros nomes.
 *
 * `-eira`/`-eiro` é a árvore ou o ofício do que vem antes: *goiabeira* é a
 * árvore da *goiaba*. Tem de vir antes das regras de verbo, senão o `-eira`
 * é confundido com o mais-que-perfeito (*plantara*) e a árvore deixa de
 * encontrar o fruto.
 */
const SUFIXO_NOME: [RegExp, string, number][] = [
  [/eir[oa]s?$/, "", 3],
  [/ista(s)?$/, "", 4],
  [/mente$/, "", 4],
];

/**
 * Terminações verbais. É a lista que faz "plantou", "plantava", "plantar" e
 * "plantando" caírem todas em "plant".
 */
const VERBO: [RegExp, string, number][] = [
  [/ar(ia|ias|iamos|iam)$/, "", 3],
  [/(er|ir)(ia|ias|iamos|iam)$/, "", 3],
  [/(a|e|i)ndo$/, "", 3],
  [/(a|e|i)ss?e(m|s)?$/, "", 3],
  [/(a|e|i)ra(m|s)?$/, "", 3],
  [/(a|e|i)va(m|s)?$/, "", 3],
  [/(a|e|i)mos$/, "", 3],
  [/(a|e|i)ram$/, "", 3],
  [/(a|e|i)rei(s)?$/, "", 3],
  [/(a|e|i)ria$/, "", 3],
  [/(a|e|i)r(es|em|am)?$/, "", 3],
  [/ou$/, "", 3],
  [/ei$/, "", 3],
  [/eu$/, "", 3],
  [/iu$/, "", 3],
  [/am$/, "", 3],
  [/em$/, "", 3],
  [/(a|e|i)m$/, "", 3],
  [/(a|e|i)d[oa](s)?$/, "", 3],
];

/**
 * Vogal final do nome.
 *
 * É esta que faz "planta" (nome) encontrar "plant" (verbo já radicalizado).
 * Sem ela, a pergunta continuava a falhar — e é também a regra que mais
 * arrisca colidir, daí o mínimo de 4.
 */
const NOME: [RegExp, string, number][] = [[/[aeo]$/, "", 4]];

/**
 * Género, para as palavras curtas de mais para perder a vogal.
 *
 * `neta` e `netos` são a mesma pessoa na cabeça de quem pergunta, e numa app
 * sobre família é das ligações que mais conta — como `filha`/`filho` ou
 * `avó`/`avô`. Sem isto, *"ele era carinhoso com os netos?"* não encontrava a
 * memória onde a **neta** nasce.
 *
 * O custo é real e assumido: junta também pares que só partilham a forma
 * (`bola`/`bolo`, `pata`/`pato`). Num corpus de meia dúzia de memórias de uma
 * família, uma dessas colisões raramente decide o ranking sozinha — e o que a
 * família nota é a memória que não apareceu, não a que apareceu em quarto
 * lugar. Os casos estão no teste, para o custo ficar à vista.
 */
const GENERO: [RegExp, string, number][] = [[/a$/, "o", 3]];

function aplicar(palavra: string, regras: [RegExp, string, number][]): string {
  for (const [re, substituto, minimo] of regras) {
    if (!re.test(palavra)) continue;
    const resultado = palavra.replace(re, substituto);
    if (resultado.length >= minimo) return resultado;
    // Radical curto de mais: a regra não se aplica, e nenhuma a seguir tenta.
    return palavra;
  }
  return palavra;
}

/**
 * Reduz uma palavra já normalizada (minúsculas, sem acentos) ao seu radical.
 */
export function radical(palavra: string): string {
  if (palavra.length <= 3) return palavra;
  if (INVARIAVEIS.has(palavra)) return palavra;

  let p = aplicar(palavra, PLURAL);
  p = aplicar(p, GRAU);
  const antesDoSufixo = p;
  p = aplicar(p, SUFIXO_NOME);
  // Se o sufixo de nome mordeu, o radical já está: não é verbo.
  if (p !== antesDoSufixo) return p;
  const antesDoVerbo = p;
  p = aplicar(p, VERBO);
  // Só se o verbo não mordeu é que se tira a vogal do nome — senão
  // "plantar" → "plant" → "plan" perdia informação a dobrar.
  if (p === antesDoVerbo) {
    const semVogal = aplicar(p, NOME);
    if (semVogal === p) return aplicar(p, GENERO);
    // Se ainda sobra uma vogal no fim, a regra estava a comer a letra errada:
    // "coracao" → "coraca" não é radical de nada, e uma segunda passagem dava
    // um resultado diferente da primeira. Nesse caso não se aplica.
    if (!/[aeiou]$/.test(semVogal)) p = semVogal;
  }
  return p;
}
