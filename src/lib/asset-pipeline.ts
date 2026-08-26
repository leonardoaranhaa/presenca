/**
 * Pipeline de assets Fase A — GLB de casa/avatar prontos para o browser.
 *
 * Produção (CLI, fora do runtime):
 *   npx gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress webp
 *   npx gltf-transform optimize in.glb out-collider.glb --simplify 0.3  (low-poly colisão)
 *
 * Runtime: registar MeshoptDecoder antes de useGLTF; validar URLs/altura.
 */

export const ASSET_PIPELINE_DOC = `
# Pipeline GLB Presença (Fase A)

## Casa (scan)
1. Exportar GLB do Polycam/Scaniverse
2. Otimizar: gltf-transform optimize casa.glb casa-web.glb --compress meshopt
3. Collider low-poly: simplificar malha (ou exportar só paredes)
4. Colocar em /public/scans/ e preencher place.scan.glbUrl + colliderUrl

## Avatar
1. Job nativo ou studio → resultGlbUrl
2. Mesmo optimize meshopt se o ficheiro > ~5 MB
3. heightM real (1.5–2.0) para escala no mundo

## Porquê meshopt
Decode mais rápido que Draco no telemóvel; Three.js / drei suportam EXT_meshopt_compression.
`.trim();

export type GlbValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

/** Valida URL e altura antes de aplicar bodyScan / scan. */
export function validateGlbRef(opts: {
  url?: string | null;
  heightM?: number | null;
  kind: "avatar" | "place" | "collider";
}): GlbValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const url = opts.url?.trim();
  if (!url) {
    errors.push("URL do GLB em falta.");
  } else if (
    !url.startsWith("/") &&
    !url.startsWith("http://") &&
    !url.startsWith("https://") &&
    !url.startsWith("blob:") &&
    !url.startsWith("data:")
  ) {
    errors.push("URL deve ser http(s), caminho /public, blob ou data.");
  }
  if (url && url.startsWith("data:") && url.length > 2_500_000) {
    warnings.push("Data-URL muito grande; preferir ficheiro em /public ou CDN.");
  }
  if (opts.kind === "avatar" && opts.heightM != null) {
    if (opts.heightM < 1.2 || opts.heightM > 2.3) {
      warnings.push("Altura fora de 1.2–2.3 m — verifique a escala.");
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Compressão de malha nos GLB.
 *
 * Não há nada a "registar" à parte: o `useGLTF` do drei já importa o
 * `MeshoptDecoder` do `three-stdlib` e chama `loader.setMeshoptDecoder()`
 * sozinho — mas **só quando lhe passamos `useMeshopt`**, que por omissão é
 * falso. A versão anterior tentava `THREE.MeshoptDecoder = …`, que não é API
 * do three, e além disso atribui a um import de namespace: imutável em ESM, e
 * o build recusava.
 *
 * Use `GLTF_LOADER_OPTS` nas chamadas a `useGLTF` para ligar ambos os
 * decoders.
 *
 * **Draco depende da rede.** O drei vai buscar o decoder a
 * `https://www.gstatic.com/draco/…` por omissão. Num lar que deve funcionar
 * offline isso é uma dependência externa por assumir — está registada como
 * pendência no PLANO.md; a alternativa é servir o decoder de `/public`.
 */
export const GLTF_LOADER_OPTS = {
  /** @see useGLTF(path, useDraco, useMeshopt) */
  useDraco: true,
  useMeshopt: true,
} as const;
