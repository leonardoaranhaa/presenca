import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    tailwindcss(),
    tanstackStart(),
    // Nitro produz o servidor de saída e deteta o alvo de deploy (Vercel,
    // Node, etc.) a partir do ambiente. Sem ele, `vite build` gerava um
    // handler que não escuta em lado nenhum.
    nitro(),
    viteReact(),
  ],
  server: {
    host: "0.0.0.0",
    port: 8080,
  },
});
