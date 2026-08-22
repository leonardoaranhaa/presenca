import { issueTurnCredentials } from "./turn";

export async function handleTurnCredentials(req: Request): Promise<Response> {
  if (req.method !== "GET" && req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  try {
    const result = await issueTurnCredentials();
    return Response.json(result, {
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    console.error("[turn]", e);
    return Response.json({ error: "Falha ao emitir credenciais TURN" }, { status: 500 });
  }
}
