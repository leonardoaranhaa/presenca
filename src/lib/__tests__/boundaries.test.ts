import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../..", import.meta.url));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__") continue;
      out.push(...walk(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** `from "..."` / `import("...")` de cada ficheiro. */
function importsOf(file: string): string[] {
  const src = readFileSync(file, "utf8");
  return [...src.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]!);
}

describe("limite servidor/cliente", () => {
  // Esta é a regressão mais cara do projeto: lib/ai.ts lia process.env e era
  // importado por componentes do browser. A conversa — a funcionalidade
  // central — nunca funcionou em ambiente nenhum, e a chave da API arriscava
  // ir parar ao bundle do cliente.
  const clientDirs = ["lib", "components"];

  for (const dir of clientDirs) {
    it(`src/${dir} não importa de src/server`, () => {
      const offenders: string[] = [];
      for (const file of walk(join(SRC, dir))) {
        for (const spec of importsOf(file)) {
          if (spec.startsWith("@/server/") || /(^|\/)\.\.\/server\//.test(spec)) {
            offenders.push(`${file.replace(SRC, "src/")} → ${spec}`);
          }
        }
      }
      expect(offenders).toEqual([]);
    });
  }

  it("só src/server e vite.config.ts leem process.env", () => {
    const offenders: string[] = [];
    for (const dir of clientDirs) {
      for (const file of walk(join(SRC, dir))) {
        if (/\bprocess\s*\.\s*env\b/.test(readFileSync(file, "utf8"))) {
          offenders.push(file.replace(SRC, "src/"));
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("segredos não são expostos por variáveis VITE_", () => {
    // Tudo o que começa por VITE_ acaba no bundle do browser.
    const secretish = /VITE_[A-Z_]*(KEY|SECRET|TOKEN|PASSWORD)/;
    const offenders: string[] = [];
    for (const dir of [...clientDirs, "server", "routes"]) {
      for (const file of walk(join(SRC, dir))) {
        const src = readFileSync(file, "utf8");
        const hit = src.match(secretish);
        if (hit) offenders.push(`${file.replace(SRC, "src/")} → ${hit[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
