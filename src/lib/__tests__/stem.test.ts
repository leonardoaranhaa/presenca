import { describe, expect, it } from "vitest";
import { radical } from "@/lib/mimetic-brain/stem";

/**
 * O que interessa não é o radical ser "bonito" — é duas palavras da mesma
 * família caírem no mesmo sítio, e duas de famílias diferentes não caírem.
 */

function mesmo(a: string, b: string) {
  return radical(a) === radical(b);
}

describe("radical — palavras da mesma família encontram-se", () => {
  it("nome e verbo: a pergunta que falhava", () => {
    // "ele gostava de plantas?" sobre alguém que plantou uma goiabeira
    expect(mesmo("plantas", "plantou")).toBe(true);
    expect(mesmo("planta", "plantar")).toBe(true);
    expect(mesmo("plantava", "plantando")).toBe(true);
  });

  it("plural e singular", () => {
    expect(mesmo("netos", "neto")).toBe(true);
    expect(mesmo("neta", "netas")).toBe(true);
    expect(mesmo("bilhetes", "bilhete")).toBe(true);
    expect(mesmo("cadarcos", "cadarco")).toBe(true);
  });

  it("plurais irregulares", () => {
    expect(mesmo("coracoes", "coracao")).toBe(true);
    expect(mesmo("animais", "animal")).toBe(true);
    expect(mesmo("papeis", "papel")).toBe(true);
    expect(mesmo("jardins", "jardim")).toBe(true);
  });

  it("diminutivo, que é como a família fala", () => {
    expect(mesmo("cafezinho", "cafe")).toBe(true);
    expect(mesmo("netinha", "neta")).toBe(true);
  });

  it("conjugações do mesmo verbo", () => {
    expect(mesmo("gostava", "gostar")).toBe(true);
    expect(mesmo("ensinou", "ensinar")).toBe(true);
    expect(mesmo("deixava", "deixar")).toBe(true);
  });
});

describe("radical — não junta o que não é da mesma família", () => {
  it("palavras distintas continuam distintas", () => {
    expect(mesmo("cafe", "carro")).toBe(false);
    expect(mesmo("goiaba", "goleiro")).toBe(false);
    expect(mesmo("memoria", "memorial")).toBe(false);
    expect(mesmo("pai", "paz")).toBe(false);
  });

  it("não destrói palavras curtas", () => {
    for (const curta of ["pai", "mae", "voz", "sol", "cao"]) {
      expect(radical(curta), curta).toBe(curta);
    }
  });

  it("um radical nunca fica com menos de 3 letras", () => {
    const palavras = [
      "plantas",
      "netos",
      "cafes",
      "casas",
      "amores",
      "vozes",
      "flores",
      "gostava",
      "ensinou",
      "amarrar",
      "dizia",
      "vinha",
      "era",
      "foram",
    ];
    for (const p of palavras) {
      expect(radical(p).length, `${p} -> ${radical(p)}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("é idempotente — radicalizar duas vezes dá o mesmo", () => {
    for (const p of ["plantas", "netos", "gostava", "cafezinho", "coracoes"]) {
      expect(radical(radical(p)), p).toBe(radical(p));
    }
  });
});

describe("radical — género", () => {
  it("junta o feminino e o masculino da mesma palavra de família", () => {
    // "ele era carinhoso com os netos?" tem de encontrar a memória da neta.
    expect(mesmo("netos", "neta")).toBe(true);
    expect(mesmo("filha", "filhos")).toBe(true);
    expect(mesmo("avo", "avos")).toBe(true);
  });

  it("o custo assumido: pares que só partilham a forma", () => {
    // Documentado, não desejado. Se um dia isto começar a estragar respostas,
    // é aqui que se vê o que a regra junta.
    expect(mesmo("bola", "bolo")).toBe(true);
    expect(mesmo("pata", "pato")).toBe(true);
  });
});

describe("radical — a árvore e o fruto", () => {
  it("liga o que dá ao que é dado", () => {
    // -eira é a árvore da coisa. Sem uma regra própria, "goiabeira" era lida
    // como forma verbal e nunca encontrava "goiaba".
    expect(mesmo("goiabeira", "goiaba")).toBe(true);
    expect(mesmo("goiabeiras", "goiabas")).toBe(true);
    expect(mesmo("laranjeira", "laranja")).toBe(true);
  });

  it("não confunde -eira com o mais-que-perfeito", () => {
    expect(radical("plantara")).toBe(radical("plantar"));
  });
});
