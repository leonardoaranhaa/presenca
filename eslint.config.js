import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["dist/**", ".output/**", ".nitro/**", "src/routeTree.gen.ts", "node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // As regras do React Compiler assumem semântica de render do React.
      // Duas partes deste código não a seguem, e por boas razões:
      //
      //  - src/components/world/** é react-three-fiber. `useFrame` corre fora
      //    do ciclo de render e mutar objetos Three.js aí é o padrão
      //    documentado — alocar por frame a 60 fps é que seria o erro.
      //  - os painéis lêem preferências de localStorage num efeito porque no
      //    SSR não há localStorage; ler durante o render quebraria a hidratação.
      //
      // Ficam como aviso: continuam visíveis, sem obrigar a reescrever código
      // correto para agradar a um linter que não modela estes casos. As regras
      // de correção de hooks (rules-of-hooks, exhaustive-deps) ficam a erro.
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",

      // Um `_` à frente marca deliberadamente o que não se usa.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // A regra que guarda o bug mais caro deste projeto: código de cliente
      // não pode importar de src/server (ver CLAUDE.md e o teste em
      // src/lib/__tests__/boundaries.test.ts).
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/server/*", "**/server/*"],
              message:
                "src/lib e src/components correm no browser: importar de src/server expõe chaves de API. Use src/lib/ai-client.ts ou uma rota /api/*.",
            },
          ],
        },
      ],
    },
  },
  {
    // src/server e party são código de servidor: a restrição acima não se aplica.
    files: ["src/server/**/*.ts", "src/routes/api/**/*.ts", "party/**/*.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    files: ["**/*.test.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    // Servidores falsos para desenvolvimento (SFU, traje háptico): correm em
    // Node, não no browser.
    files: ["scripts/**/*.mjs", "scripts/**/*.js"],
    languageOptions: { globals: globals.node },
    rules: { "no-restricted-imports": "off" },
  },
  prettier,
);
