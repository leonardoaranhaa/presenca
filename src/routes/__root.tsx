import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { Toaster } from "sonner";
import appCss from "../styles.css?url";

const APP_NAME = "Presença";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: APP_NAME },
      {
        name: "description",
        content: "O lar virtual onde a família continua junta — vivos e memoriais.",
      },
      { name: "theme-color", content: "#12100e" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  component: () => (
    <html lang="pt-BR" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="bg-background text-foreground">
        <Outlet />
        <Toaster
          theme="dark"
          position="top-center"
          toastOptions={{
            style: {
              background: "#1c1916",
              color: "#f3efe8",
              border: "1px solid rgb(243 239 232 / 0.12)",
            },
          }}
        />
        <Scripts />
      </body>
    </html>
  ),
});
