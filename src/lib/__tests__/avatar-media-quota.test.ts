import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { addMediaToJob, urlsParaFornecedor } from "../avatar-from-media";
import type { AvatarBuildJob } from "../types";

/**
 * As media do avatar são ficheiros de uma pessoa — fotos, vídeos. Se entrarem
 * em data URL no estado que o zustand persiste, vão para o localStorage, que
 * tem ~5 MB no total. Já custou as memórias do cofre uma vez; o pedido de
 * avatar é o mesmo erro noutro sítio.
 *
 * Estes testes guardam a decisão: no estado fica um id, os bytes ficam no
 * IndexedDB.
 */

const PAINEL = "src/components/persona/avatar-from-media-panel.tsx";

function jobVazio(): AvatarBuildJob {
  return {
    id: "job_1",
    personaId: "persona_antonio",
    path: "self_service",
    status: "draft",
    media: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("media do avatar fora do estado persistido", () => {
  it("o painel guarda os bytes no IndexedDB, não numa data URL", () => {
    const src = readFileSync(PAINEL, "utf8");
    expect(src).toContain("putMedia(file");
    // `readFileAsDataUrl` produzia a string base64 que ia parar ao localStorage.
    expect(src).not.toContain("readFileAsDataUrl");
  });

  it("remover uma media apaga também os bytes", () => {
    const src = readFileSync(PAINEL, "utf8");
    // Sem isto, tirar a foto da lista deixava-a no IndexedDB sem nada que lhe
    // chegasse — nem para a mostrar, nem para a apagar.
    expect(src).toContain("deleteMedia(");
  });

  describe("o que segue para o gerador 3D", () => {
    it("deixa passar https públicas", () => {
      expect(
        urlsParaFornecedor([
          { id: "1", kind: "photo", url: "https://storage.exemplo/a.jpg", addedAt: 0 },
        ]),
      ).toEqual(["https://storage.exemplo/a.jpg"]);
    });

    it("nunca deixa sair uma data URL — seria mandar a foto da família", () => {
      expect(
        urlsParaFornecedor([
          { id: "1", kind: "photo", url: "data:image/jpeg;base64,AAAA", addedAt: 0 },
        ]),
      ).toEqual([]);
    });

    it("recusa http, que mandaria a foto em claro", () => {
      expect(
        urlsParaFornecedor([{ id: "1", kind: "photo", url: "http://exemplo/a.jpg", addedAt: 0 }]),
      ).toEqual([]);
    });

    it("uma media guardada no IndexedDB não tem URL para dar", () => {
      expect(
        urlsParaFornecedor([{ id: "1", kind: "photo", mediaId: "media_abc", addedAt: 0 }]),
      ).toEqual([]);
    });

    it("vídeos não seguem — o gerador é image-to-3d", () => {
      expect(
        urlsParaFornecedor([
          { id: "1", kind: "video", url: "https://storage.exemplo/v.mp4", addedAt: 0 },
        ]),
      ).toEqual([]);
    });
  });

  it("uma referência de media cabe em bytes, não em megabytes", () => {
    const job = addMediaToJob(jobVazio(), {
      kind: "photo",
      mediaId: "media_abc123",
      name: "antonio-frente.jpg",
      angle: "front",
    });

    const serializado = JSON.stringify(job);
    expect(serializado).not.toContain("data:");
    // Uma foto de 3 MB em base64 dá ~4 MB de string. Uma referência dá isto.
    expect(serializado.length).toBeLessThan(500);
  });

  it("os limites de contagem continuam a valer", () => {
    let job = jobVazio();
    for (let i = 0; i < 24; i++) {
      job = addMediaToJob(job, { kind: "photo", mediaId: `media_${i}` });
    }
    expect(() => addMediaToJob(job, { kind: "photo", mediaId: "media_x" })).toThrow(/24/);
  });
});
