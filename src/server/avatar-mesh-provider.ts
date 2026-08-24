/**
 * Conector a geradores de malha 3D (image → GLB).
 *
 * Env:
 *   AVATAR_MESH_API_URL   — base do fornecedor
 *   AVATAR_MESH_API_KEY   — Bearer token
 *   AVATAR_MESH_PROVIDER  — "meshy" | "generic" (default generic)
 *
 * Generic contract (POST start + GET status):
 *   POST {url}/v1/image-to-3d  body: { image_url, prompt? }
 *     → { id: string }
 *   GET  {url}/v1/image-to-3d/{id}
 *     → { status: "PENDING"|"IN_PROGRESS"|"SUCCEEDED"|"FAILED", model_urls?: { glb?: string } }
 *
 * Meshy OpenAPI (image-to-3d) usa o mesmo formato de estados.
 */

export type MeshStartResult = { ok: true; externalId: string } | { ok: false; error: string };

export type MeshPollResult =
  | { ok: true; status: "pending" | "ready" | "failed"; glbUrl?: string; detail?: string }
  | { ok: false; error: string };

function config() {
  const base = (process.env.AVATAR_MESH_API_URL || "").replace(/\/$/, "");
  const key = process.env.AVATAR_MESH_API_KEY || "";
  const provider = (process.env.AVATAR_MESH_PROVIDER || "generic").toLowerCase();
  return { base, key, provider };
}

export function meshProviderConfigured(): boolean {
  const { base, key } = config();
  return Boolean(base && key);
}

async function providerFetch(
  path: string,
  init?: RequestInit,
): Promise<{ res: Response; text: string }> {
  const { base, key } = config();
  const url = path.startsWith("http") ? path : `${base}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text().catch(() => "");
  return { res, text };
}

/**
 * Inicia image-to-3d com a primeira imagem HTTPS (ou data URL se o fornecedor aceitar).
 */
export async function startImageToMesh(input: {
  imageUrl: string;
  prompt?: string;
}): Promise<MeshStartResult> {
  if (!meshProviderConfigured()) {
    return { ok: false, error: "Fornecedor de malha não configurado." };
  }
  const { provider } = config();

  try {
    if (provider === "meshy") {
      // Meshy OpenAPI image-to-3d
      const { res, text } = await providerFetch("/openapi/v1/image-to-3d", {
        method: "POST",
        body: JSON.stringify({
          image_url: input.imageUrl,
          enable_pbr: true,
          should_remesh: true,
          topology: "triangle",
          target_polycount: 30000,
          ai_model: "latest",
        }),
      });
      if (!res.ok) {
        console.error("[presenca:mesh:meshy]", res.status, text.slice(0, 400));
        return { ok: false, error: `Meshy recusou o pedido (${res.status}).` };
      }
      const body = JSON.parse(text) as { result?: string; id?: string };
      const id = body.result || body.id;
      if (!id) return { ok: false, error: "Meshy não devolveu id de tarefa." };
      return { ok: true, externalId: id };
    }

    // Generic
    const { res, text } = await providerFetch("/v1/image-to-3d", {
      method: "POST",
      body: JSON.stringify({
        image_url: input.imageUrl,
        prompt: input.prompt,
      }),
    });
    if (!res.ok) {
      console.error("[presenca:mesh:generic]", res.status, text.slice(0, 400));
      return { ok: false, error: `Gerador recusou o pedido (${res.status}).` };
    }
    const body = JSON.parse(text) as { id?: string; result?: string; task_id?: string };
    const id = body.id || body.result || body.task_id;
    if (!id) return { ok: false, error: "Gerador não devolveu id." };
    return { ok: true, externalId: id };
  } catch (e) {
    console.error("[presenca:mesh:start]", e);
    return { ok: false, error: "Falha de rede no gerador 3D." };
  }
}

export async function pollImageToMesh(externalId: string): Promise<MeshPollResult> {
  if (!meshProviderConfigured()) {
    return { ok: false, error: "Fornecedor de malha não configurado." };
  }
  const { provider } = config();

  try {
    const path =
      provider === "meshy"
        ? `/openapi/v1/image-to-3d/${encodeURIComponent(externalId)}`
        : `/v1/image-to-3d/${encodeURIComponent(externalId)}`;

    const { res, text } = await providerFetch(path, { method: "GET" });
    if (!res.ok) {
      console.error("[presenca:mesh:poll]", res.status, text.slice(0, 400));
      return { ok: false, error: `Poll falhou (${res.status}).` };
    }

    const body = JSON.parse(text) as {
      status?: string;
      model_urls?: { glb?: string };
      result?: string;
      progress?: number;
      task_error?: { message?: string };
    };

    const st = (body.status || "").toUpperCase();
    if (st === "SUCCEEDED" || st === "SUCCESS" || st === "DONE" || st === "READY") {
      const glb =
        body.model_urls?.glb ||
        (typeof body.result === "string" && body.result.endsWith(".glb") ? body.result : undefined);
      if (!glb) {
        return {
          ok: true,
          status: "failed",
          detail: "Tarefa concluída sem URL GLB.",
        };
      }
      return { ok: true, status: "ready", glbUrl: glb };
    }
    if (st === "FAILED" || st === "ERROR" || st === "CANCELED") {
      return {
        ok: true,
        status: "failed",
        detail: body.task_error?.message || st,
      };
    }
    return { ok: true, status: "pending", detail: st || "IN_PROGRESS" };
  } catch (e) {
    console.error("[presenca:mesh:poll]", e);
    return { ok: false, error: "Falha de rede no poll do gerador." };
  }
}

/** Poll com backoff até ready/failed ou timeout. */
export async function waitForMesh(
  externalId: string,
  opts?: { timeoutMs?: number; intervalMs?: number },
): Promise<MeshPollResult> {
  const timeoutMs = opts?.timeoutMs ?? 120_000;
  const intervalMs = opts?.intervalMs ?? 2500;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await pollImageToMesh(externalId);
    if (!r.ok) return r;
    if (r.status === "ready" || r.status === "failed") return r;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { ok: false, error: "Tempo esgotado à espera do gerador 3D." };
}
