/**
 * Corredor da bateria de avaliação.
 *
 *   npm run eval                    # contra o servidor local (npm run dev)
 *   BASE_URL=https://… npm run eval # contra um deploy
 *
 * Gasta dinheiro real: cada cenário é uma chamada ao fornecedor. São 7
 * cenários, ~2 500 tokens de entrada e ~350 de saída cada — cêntimos, não
 * euros, mas convém saber.
 *
 * A pontuação é por regras, não por outro modelo a julgar: é reproduzível,
 * não custa nada, e não introduz o enviesamento de pedir a um LLM que avalie
 * outro. O custo é não apanhar subtileza — por isso o relatório imprime as
 * respostas inteiras, para leitura humana.
 */

import { CENARIOS, PERSONA, type Cenario } from "./scenarios";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:8080";

type Resultado = {
  cenario: Cenario;
  resposta: string;
  falhas: string[];
  erro?: string;
};

async function perguntar(c: Cenario): Promise<{ texto?: string; erro?: string }> {
  try {
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        persona: PERSONA,
        history: c.historico ?? [],
        message: c.mensagem,
      }),
    });
    const corpo = (await res.json().catch(() => null)) as { text?: string; error?: string } | null;
    if (!res.ok) return { erro: corpo?.error ?? `HTTP ${res.status}` };
    if (!corpo?.text) return { erro: "resposta sem texto" };
    return { texto: corpo.text };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e) };
  }
}

function avaliar(c: Cenario, resposta: string): string[] {
  const falhas: string[] = [];
  for (const v of c.verificacoes) {
    if (v.exige && !v.exige.some((r) => r.test(resposta))) {
      falhas.push(v.o_que);
    }
    if (v.proibe) {
      const violado = v.proibe.find((r) => r.test(resposta));
      if (violado) falhas.push(`${v.o_que} — encontrou ${violado}`);
    }
  }
  return falhas;
}

const CORES = {
  ok: "\x1b[32m",
  mau: "\x1b[31m",
  aviso: "\x1b[33m",
  fraco: "\x1b[2m",
  fim: "\x1b[0m",
};

async function main() {
  console.log(`\nBateria de avaliação da presença · ${BASE}\n`);

  const resultados: Resultado[] = [];
  for (const c of CENARIOS) {
    process.stdout.write(`  ${c.id}… `);
    const { texto, erro } = await perguntar(c);
    if (erro) {
      console.log(`${CORES.aviso}sem resposta${CORES.fim} (${erro})`);
      resultados.push({ cenario: c, resposta: "", falhas: [], erro });
      continue;
    }
    const falhas = avaliar(c, texto!);
    console.log(
      falhas.length
        ? `${CORES.mau}${falhas.length} falha(s)${CORES.fim}`
        : `${CORES.ok}passou${CORES.fim}`,
    );
    resultados.push({ cenario: c, resposta: texto!, falhas });
  }

  console.log("\n" + "─".repeat(72) + "\n");

  for (const r of resultados) {
    const marca = r.erro
      ? `${CORES.aviso}?${CORES.fim}`
      : r.falhas.length
        ? `${CORES.mau}✗${CORES.fim}`
        : `${CORES.ok}✓${CORES.fim}`;
    console.log(`${marca} ${r.cenario.id}  [${r.cenario.gravidade}]`);
    console.log(`${CORES.fraco}   ${r.cenario.porque}${CORES.fim}`);
    console.log(`${CORES.fraco}   → "${r.cenario.mensagem}"${CORES.fim}`);
    if (r.erro) {
      console.log(`   ${CORES.aviso}sem resposta: ${r.erro}${CORES.fim}\n`);
      continue;
    }
    console.log(`   ${r.resposta.replace(/\n/g, "\n   ")}`);
    for (const f of r.falhas) console.log(`   ${CORES.mau}falhou: ${f}${CORES.fim}`);
    console.log();
  }

  const criticos = resultados.filter((r) => r.cenario.gravidade === "critico" && r.falhas.length);
  const semResposta = resultados.filter((r) => r.erro);
  const passaram = resultados.filter((r) => !r.erro && !r.falhas.length);

  console.log("─".repeat(72));
  console.log(
    `passaram ${passaram.length}/${resultados.length}` +
      (semResposta.length ? ` · ${semResposta.length} sem resposta` : "") +
      (criticos.length ? ` · ${CORES.mau}${criticos.length} falha(s) crítica(s)${CORES.fim}` : ""),
  );

  if (criticos.length) {
    console.log(
      `\n${CORES.mau}Falhas críticas são motivo para não usar este modelo neste produto:${CORES.fim}`,
    );
    for (const r of criticos) console.log(`  · ${r.cenario.id}: ${r.falhas.join("; ")}`);
  }
  if (semResposta.length && semResposta.length === resultados.length) {
    console.log(
      `\n${CORES.aviso}Nenhum cenário obteve resposta. Verifique se o servidor está a correr e se a chave de IA está configurada (GET /api/status).${CORES.fim}`,
    );
  }
  console.log();

  process.exit(criticos.length ? 1 : 0);
}

void main();
