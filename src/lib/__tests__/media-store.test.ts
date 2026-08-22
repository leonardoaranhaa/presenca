import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  blobToDataUrl,
  clearMedia,
  dataUrlToBlob,
  deleteMedia,
  deleteMediaFor,
  getMediaBlob,
  listMediaMeta,
  putMedia,
} from "../media-store";
import { migrateMediaToIndexedDb } from "../media-migration";
import type { Persona } from "../types";

beforeEach(async () => {
  await clearMedia();
});

function blob(texto = "bytes", type = "image/jpeg") {
  return new Blob([texto], { type });
}

describe("media-store", () => {
  it("guarda e devolve os mesmos bytes", async () => {
    const id = await putMedia(blob("a goiabeira"), { personaId: "p1" });
    const lido = await getMediaBlob(id);
    expect(await lido!.text()).toBe("a goiabeira");
  });

  it("preserva o tipo do ficheiro", async () => {
    const id = await putMedia(blob("x", "audio/mpeg"), { personaId: "p1" });
    expect((await getMediaBlob(id))!.type).toBe("audio/mpeg");
  });

  it("devolve null para um id que não existe", async () => {
    expect(await getMediaBlob("nao_existe")).toBeNull();
  });

  it("apaga uma media", async () => {
    const id = await putMedia(blob(), { personaId: "p1" });
    await deleteMedia(id);
    expect(await getMediaBlob(id)).toBeNull();
  });

  it("apaga tudo o que é de uma persona sem tocar no resto", async () => {
    const a = await putMedia(blob("do avô"), { personaId: "avo" });
    const b = await putMedia(blob("da avó"), { personaId: "avo" });
    const c = await putMedia(blob("do pai"), { personaId: "pai" });

    await deleteMediaFor("avo");

    expect(await getMediaBlob(a)).toBeNull();
    expect(await getMediaBlob(b)).toBeNull();
    expect(await getMediaBlob(c)).not.toBeNull();
  });

  it("lista metadados sem carregar os bytes", async () => {
    await putMedia(blob("conteudo"), { personaId: "p1" });
    const metas = await listMediaMeta();
    expect(metas).toHaveLength(1);
    expect(metas[0]).toMatchObject({ personaId: "p1", type: "image/jpeg" });
    expect(metas[0]).not.toHaveProperty("blob");
    expect(metas[0]!.bytes).toBeGreaterThan(0);
  });

  it("ids são únicos", async () => {
    const ids = await Promise.all(
      Array.from({ length: 20 }, () => putMedia(blob(), { personaId: "p" })),
    );
    expect(new Set(ids).size).toBe(20);
  });
});

describe("conversões", () => {
  it("data URL → blob → data URL preserva o conteúdo", async () => {
    const original = "data:image/png;base64,aGVsbG8gd29ybGQ=";
    const b = dataUrlToBlob(original)!;
    expect(b.type).toBe("image/png");
    expect(await b.text()).toBe("hello world");
    expect(await blobToDataUrl(b)).toBe(original);
  });

  it("data URL inválida devolve null em vez de rebentar", () => {
    expect(dataUrlToBlob("não é uma data url")).toBeNull();
    expect(dataUrlToBlob("")).toBeNull();
  });
});

describe("migração para IndexedDB", () => {
  function persona(memories: Persona["memories"]): Persona {
    return {
      id: "p1",
      kind: "memorial",
      name: "Antônio",
      relationship: "Avô",
      bio: "",
      traits: [],
      speechNotes: "",
      favorites: "",
      hue: "ink",
      hair: "bald",
      room: "garden",
      memories,
    };
  }

  it("move a media antiga e limpa o campo", async () => {
    const p = persona([
      {
        id: "m1",
        kind: "photo",
        title: "A goiabeira",
        body: "",
        mediaDataUrl: "data:image/png;base64,aGVsbG8=",
        createdAt: 1,
      },
    ]);

    const { personas, migradas } = await migrateMediaToIndexedDb([p]);
    expect(migradas).toBe(1);

    const m = personas[0]!.memories[0]!;
    expect(m.mediaDataUrl).toBeUndefined();
    expect(m.mediaId).toBeTruthy();
    expect(await (await getMediaBlob(m.mediaId!))!.text()).toBe("hello");
  });

  it("não mexe no que já está migrado", async () => {
    const p = persona([
      { id: "m1", kind: "photo", title: "t", body: "", mediaId: "media_x", createdAt: 1 },
    ]);
    const { migradas, personas } = await migrateMediaToIndexedDb([p]);
    expect(migradas).toBe(0);
    expect(personas[0]!.memories[0]!.mediaId).toBe("media_x");
  });

  it("memórias sem media passam intactas", async () => {
    const p = persona([
      { id: "m1", kind: "story", title: "A goiabeira", body: "Plantou em 1974.", createdAt: 1 },
    ]);
    const { migradas, personas } = await migrateMediaToIndexedDb([p]);
    expect(migradas).toBe(0);
    expect(personas[0]!.memories[0]!.body).toBe("Plantou em 1974.");
  });

  it("descarta uma data URL corrompida sem perder a memória", async () => {
    const p = persona([
      { id: "m1", kind: "photo", title: "t", body: "corpo", mediaDataUrl: "lixo", createdAt: 1 },
    ]);
    const { personas } = await migrateMediaToIndexedDb([p]);
    const m = personas[0]!.memories[0]!;
    expect(m.mediaDataUrl).toBeUndefined();
    expect(m.body).toBe("corpo");
  });

  it("correr duas vezes não duplica", async () => {
    const p = persona([
      {
        id: "m1",
        kind: "photo",
        title: "t",
        body: "",
        mediaDataUrl: "data:image/png;base64,aGVsbG8=",
        createdAt: 1,
      },
    ]);
    const primeira = await migrateMediaToIndexedDb([p]);
    const segunda = await migrateMediaToIndexedDb(primeira.personas);
    expect(segunda.migradas).toBe(0);
    expect(await listMediaMeta()).toHaveLength(1);
  });
});
