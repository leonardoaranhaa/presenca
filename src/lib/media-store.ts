/**
 * Armazenamento das media do cofre — fotos, notas de voz, vídeos.
 *
 * **Porque não localStorage.** As media eram gravadas como data URLs dentro do
 * estado do zustand, em localStorage, que tem ~5 MB no total. Uma foto
 * comprimida ronda os 116 KB depois de base64; uma nota de voz ou vídeo pode ir
 * até 4,5 MB. O cofre de memórias é exatamente o sítio onde uma família põe
 * muitos ficheiros: com ~40 fotos a quota estoura e as memórias seguintes
 * perdem-se. IndexedDB guarda `Blob` sem base64 (menos ~27%) e tem quota na
 * ordem das centenas de MB.
 *
 * O estado (personas, memórias, chat) continua em localStorage: é pequeno,
 * síncrono e é o que o zustand persiste bem. Aqui ficam só os bytes.
 *
 * Sem dependências novas: a API do IndexedDB é verbosa mas o que precisamos
 * dela é pouco, e um wrapper próprio é menos superfície do que outro pacote.
 */

const DB_NAME = "presenca-media";
const DB_VERSION = 1;
const STORE = "media";

export type MediaMeta = {
  id: string;
  personaId: string;
  type: string;
  bytes: number;
  createdAt: number;
};

type MediaRecord = MediaMeta & { blob: Blob };

function semIndexedDb(): boolean {
  return typeof indexedDB === "undefined";
}

let dbPromise: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("personaId", "personaId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB indisponível"));
    // Modo privado em alguns browsers bloqueia sem lançar.
    req.onblocked = () => reject(new Error("IndexedDB bloqueado"));
  });
  // Uma falha não deve envenenar o cache para sempre.
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function transacao<T>(
  modo: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return abrir().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, modo);
        const req = fn(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("Falha no IndexedDB"));
      }),
  );
}

export function novoMediaId(): string {
  return `media_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Guarda os bytes e devolve o id a pôr em `Memory.mediaId`. */
export async function putMedia(
  blob: Blob,
  meta: { personaId: string; id?: string },
): Promise<string> {
  if (semIndexedDb()) throw new Error("Sem IndexedDB neste ambiente");
  const registo: MediaRecord = {
    id: meta.id ?? novoMediaId(),
    personaId: meta.personaId,
    type: blob.type || "application/octet-stream",
    bytes: blob.size,
    createdAt: Date.now(),
    blob,
  };
  await transacao("readwrite", (s) => s.put(registo));
  return registo.id;
}

export async function getMediaBlob(id: string): Promise<Blob | null> {
  if (semIndexedDb()) return null;
  try {
    const r = await transacao<MediaRecord | undefined>("readonly", (s) => s.get(id));
    return r?.blob ?? null;
  } catch {
    return null;
  }
}

/**
 * URL temporária para mostrar a media.
 * Quem chama **tem de** libertar com `URL.revokeObjectURL`, senão o blob fica
 * retido em memória até fechar o separador.
 */
export async function getMediaUrl(id: string): Promise<string | null> {
  const blob = await getMediaBlob(id);
  return blob ? URL.createObjectURL(blob) : null;
}

export async function deleteMedia(id: string): Promise<void> {
  if (semIndexedDb()) return;
  try {
    await transacao("readwrite", (s) => s.delete(id));
  } catch {
    /* apagar o que já não existe não é erro */
  }
}

/** Remove tudo o que pertence a uma persona — usado ao retirá-la do lar. */
export async function deleteMediaFor(personaId: string): Promise<void> {
  if (semIndexedDb()) return;
  try {
    const db = await abrir();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const idx = tx.objectStore(STORE).index("personaId");
      const req = idx.openCursor(IDBKeyRange.only(personaId));
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

export async function listMediaMeta(): Promise<MediaMeta[]> {
  if (semIndexedDb()) return [];
  try {
    const todos = await transacao<MediaRecord[]>("readonly", (s) => s.getAll());
    return todos.map(({ blob: _blob, ...meta }) => meta);
  } catch {
    return [];
  }
}

/** Apaga tudo. Usado pelo "apagar dados locais" da LGPD. */
export async function clearMedia(): Promise<void> {
  if (semIndexedDb()) return;
  try {
    await transacao("readwrite", (s) => s.clear());
  } catch {
    /* ignore */
  }
}

/** Espaço ocupado e disponível, quando o browser o expõe. */
export async function estimateStorage(): Promise<{ usado: number; disponivel: number } | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  try {
    const e = await navigator.storage.estimate();
    return { usado: e.usage ?? 0, disponivel: e.quota ?? 0 };
  } catch {
    return null;
  }
}

// ——— conversões (migração e portabilidade LGPD) ———

export function dataUrlToBlob(dataUrl: string): Blob | null {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;
  try {
    const bin = atob(m[2]!);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: m[1]! });
  } catch {
    return null;
  }
}

/**
 * Não usa `FileReader`: `arrayBuffer()` existe no browser e no Node, o que
 * torna esta função testável fora do browser — e o caminho que a usa (enviar
 * fotos e voz para as rotas de IA) merece teste.
 */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return `data:${blob.type || "application/octet-stream"};base64,${base64(bytes)}`;
}

/**
 * `btoa(String.fromCharCode(...bytes))` rebenta a pilha em ficheiros grandes —
 * e aqui passam vídeos. Converte por blocos.
 */
function base64(bytes: Uint8Array): string {
  const BLOCO = 0x8000;
  let bin = "";
  for (let i = 0; i < bytes.length; i += BLOCO) {
    bin += String.fromCharCode(...bytes.subarray(i, i + BLOCO));
  }
  return btoa(bin);
}
