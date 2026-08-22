#!/usr/bin/env bash
# Prepara a sessão: garante que as dependências estão instaladas para que
# typecheck, lint, testes e build possam correr sem um passo manual.
set -euo pipefail
cd "$(dirname "$0")/../.."

if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  echo "A instalar dependências…"
  npm ci --no-audit --no-fund 2>&1 | tail -3
else
  echo "Dependências já instaladas."
fi

echo "Comandos: npm run dev | npm run check | npm run build"
echo "Regra do projeto: src/lib e src/components nunca importam de src/server (ver CLAUDE.md)."
