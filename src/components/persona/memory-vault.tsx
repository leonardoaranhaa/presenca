import { useRef, useState } from "react";
import { ImagePlus, Mic, Sparkles, Trash2, Type, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { awakenPresence } from "@/lib/ai-client";
import { loadPrivacyPrefs } from "@/lib/lgpd";
import { usePresence } from "@/lib/store";
import type { Memory, MemoryKind, Persona } from "@/lib/types";
import { useMediaUrl } from "@/lib/use-media-url";
import { blobToDataUrl, dataUrlToBlob, getMediaBlob, putMedia } from "@/lib/media-store";
import { compressImage, uid } from "@/lib/utils";
import { requestVoiceClone } from "@/lib/voice";

const KINDS: { id: MemoryKind; label: string; icon: typeof Type }[] = [
  { id: "story", label: "História", icon: Type },
  { id: "photo", label: "Foto", icon: ImagePlus },
  { id: "voice", label: "Voz", icon: Mic },
  { id: "video", label: "Vídeo", icon: Video },
  { id: "letter", label: "Carta", icon: Type },
];

export function MemoryVault({ persona }: { persona: Persona }) {
  const addMemory = usePresence((s) => s.addMemory);
  const removeMemory = usePresence((s) => s.removeMemory);
  const setSoul = usePresence((s) => s.setSoul);
  const setVoiceProfile = usePresence((s) => s.setVoiceProfile);
  const [kind, setKind] = useState<MemoryKind>("story");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [cloning, setCloning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /** Limite por ficheiro. O IndexedDB aguenta mais, mas um vídeo enorme no
   *  telemóvel de outra pessoa da família não vale a pena. */
  const MAX_BYTES = 25 * 1024 * 1024;

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      let blob: Blob;
      if (kind === "photo" && file.type.startsWith("image/")) {
        // A compressão continua a valer: reduz o que fica guardado e o que
        // sobe para o despertar da presença.
        const dataUrl = await compressImage(file);
        const b = dataUrlToBlob(dataUrl);
        if (!b) throw new Error("imagem");
        blob = b;
      } else if (kind === "voice" || kind === "video") {
        if (file.size > MAX_BYTES) {
          toast.error("Ficheiro grande demais (máx. 25 MB).");
          return;
        }
        blob = file;
      } else {
        toast.error("Este tipo de ficheiro não corresponde ao tipo de memória escolhido.");
        return;
      }

      // Os bytes vão para o IndexedDB; no estado fica só a chave.
      const mediaId = await putMedia(blob, { personaId: persona.id });
      addMemory(persona.id, {
        id: uid("mem"),
        kind,
        title: title.trim() || file.name,
        body:
          body.trim() ||
          (kind === "photo"
            ? "Foto guardada no cofre."
            : kind === "voice"
              ? "Nota de voz."
              : "Vídeo de memória."),
        mediaId,
        createdAt: Date.now(),
      });

      setTitle("");
      setBody("");
      toast.success("Memória guardada.");
    } catch {
      toast.error("Não foi possível ler o arquivo.");
    }
  }

  function addText() {
    if (!body.trim()) {
      toast.error("Escreva a memória.");
      return;
    }
    const mem: Memory = {
      id: uid("mem"),
      kind,
      title: title.trim() || (kind === "letter" ? "Carta" : "História"),
      body: body.trim(),
      createdAt: Date.now(),
    };
    addMemory(persona.id, mem);
    setTitle("");
    setBody("");
    toast.success("Memória guardada.");
  }

  async function awaken() {
    setBusy(true);
    try {
      // As fotos vivem no IndexedDB; o fornecedor recebe-as em data URL.
      const photos = await memoriasComoDataUrl(persona.memories, "photo", 3);
      const res = await awakenPresence({
        name: persona.name,
        relationship: persona.relationship,
        kind: persona.kind,
        bio: persona.bio,
        traits: persona.traits,
        speechNotes: persona.speechNotes,
        favorites: persona.favorites,
        memories: persona.memories.map((m) => ({ kind: m.kind, title: m.title, body: m.body })),
        photoDataUrls: photos,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setSoul(persona.id, { ...res.soul, awakenedAt: Date.now(), systemPrompt: "" });
      toast.success(`A presença de ${persona.name} foi despertada.`);
    } catch {
      toast.error("Não foi possível ler as memórias agora.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-4 p-5">
        <div>
          <h2 className="font-display text-2xl">Cofre de memórias</h2>
          {persona.soul?.mimetic && (
            <p className="mt-1 text-xs text-accent">
              Cérebro mímico · v{persona.soul.mimetic.version} · {persona.soul.mimetic.trainSteps}{" "}
              passos · {persona.soul.mimetic.traces.length} traços
            </p>
          )}
          <p className="mt-1 text-sm text-muted">
            Fotos, voz, vídeos, cartas e o jeito de falar. A presença lê o que você confiar a ela.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => {
            const Icon = k.icon;
            return (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                className={
                  kind === k.id
                    ? "inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-3 text-xs text-primary-foreground"
                    : "inline-flex h-10 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-xs text-muted"
                }
              >
                <Icon className="size-3.5" />
                {k.label}
              </button>
            );
          })}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mt">Título</Label>
          <Input id="mt" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mb">{kind === "photo" ? "O que a foto guarda" : "Texto"}</Label>
          <Textarea id="mb" value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        {kind === "photo" || kind === "voice" || kind === "video" ? (
          <div>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept={kind === "photo" ? "image/*" : kind === "voice" ? "audio/*" : "video/*"}
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              Anexar {kind === "photo" ? "foto" : kind === "voice" ? "áudio" : "vídeo"}
            </Button>
          </div>
        ) : (
          <Button type="button" onClick={addText}>
            Guardar
          </Button>
        )}
      </Card>

      <div className="space-y-3">
        {persona.memories.length === 0 && (
          <p className="text-sm text-muted">
            O cofre ainda está vazio. Uma história já basta para começar.
          </p>
        )}
        {persona.memories.map((m) => (
          <Card key={m.id} className="flex gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-wider text-faint">{m.kind}</p>
              <p className="font-medium">{m.title}</p>
              <p className="mt-1 text-sm text-muted">{m.body}</p>
              <MemoryMedia memory={m} />
            </div>
            <button
              type="button"
              className="size-11 shrink-0 text-muted hover:text-foreground"
              aria-label="Remover memória"
              onClick={() => removeMemory(persona.id, m.id)}
            >
              <Trash2 className="mx-auto size-4" />
            </button>
          </Card>
        ))}
      </div>

      {persona.kind === "memorial" && (
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
          disabled={cloning}
          onClick={async () => {
            const samples = await memoriasComoDataUrl(persona.memories, "voice", 5);
            if (!samples.length) {
              toast.error("Guarde ao menos uma nota de voz no cofre antes de clonar.");
              return;
            }

            // O consentimento vem das preferências que a família ativou, não de
            // um valor escrito no código. O servidor volta a exigi-lo.
            const prefs = loadPrivacyPrefs();
            const consent = {
              allowVoiceClone: prefs.allowVoiceClone,
              memorialFamilyAuthority: prefs.memorialFamilyAuthority,
              policyVersion: prefs.acceptedPolicyVersion,
              acceptedAt: prefs.acceptedPolicyAt ?? 0,
            };

            // Clonar cria uma voz num fornecedor externo a partir da voz de
            // alguém que já partiu. Não deve acontecer por um clique distraído.
            if (
              !confirm(
                `Vai criar uma voz sintética de ${persona.name} a partir de ${samples.length} ` +
                  `nota(s) do cofre, num fornecedor externo (ElevenLabs). ` +
                  `Só faça isto com a concordância da família. Continuar?`,
              )
            ) {
              return;
            }

            setCloning(true);
            try {
              const res = await requestVoiceClone({
                personaId: persona.id,
                name: persona.name,
                sampleDataUrls: samples,
                consent,
              });
              if (!res.ok) {
                toast.error(res.error);
                return;
              }
              setVoiceProfile(persona.id, {
                provider: "elevenlabs",
                elevenLabsVoiceId: res.voiceId,
                consentAt: Date.now(),
              });
              toast.success("Voz indexada no perfil da presença (ElevenLabs).");
            } finally {
              setCloning(false);
            }
          }}
        >
          {cloning ? "A clonar…" : "Clonar voz (ElevenLabs)"}
        </Button>
      )}
      {persona.voiceProfile?.provider === "elevenlabs" && (
        <p className="text-xs text-muted">
          Voz clonada · id {persona.voiceProfile.elevenLabsVoiceId?.slice(0, 8)}…
        </p>
      )}

      <Button
        onClick={() => void awaken()}
        disabled={busy}
        variant="accent"
        className="w-full sm:w-auto"
      >
        <Sparkles className="size-4" />
        {busy ? "Lendo as memórias…" : "Despertar presença"}
      </Button>
      {persona.soul && (
        <Card className="p-5">
          <p className="text-[11px] uppercase tracking-wider text-faint">Perfil despertado</p>
          <p className="mt-2 text-sm leading-relaxed">{persona.soul.summary}</p>
          {persona.soul.voice && (
            <p className="mt-2 text-sm text-muted">Voz: {persona.soul.voice}</p>
          )}
        </Card>
      )}
    </div>
  );
}

/**
 * Lê media do cofre e devolve-a em data URL, que é o formato que as rotas de
 * IA e de voz aceitam. Os bytes ficam no IndexedDB; isto é só a conversão para
 * a chamada.
 */
async function memoriasComoDataUrl(
  memories: Memory[],
  kind: MemoryKind,
  max: number,
): Promise<string[]> {
  const candidatas = memories.filter((m) => m.kind === kind).slice(0, max);
  const urls = await Promise.all(
    candidatas.map(async (m) => {
      if (m.mediaId) {
        const blob = await getMediaBlob(m.mediaId);
        return blob ? blobToDataUrl(blob) : null;
      }
      // Dados anteriores à migração para IndexedDB.
      return m.mediaDataUrl ?? null;
    }),
  );
  return urls.filter((u): u is string => !!u);
}

/** Mostra a media de uma memória, do IndexedDB ou do formato antigo. */
function MemoryMedia({ memory }: { memory: Memory }) {
  const url = useMediaUrl(memory.mediaId, memory.mediaDataUrl);
  if (!url) return null;

  if (memory.kind === "photo") {
    return (
      <img
        src={url}
        alt={memory.title}
        loading="lazy"
        className="mt-2 max-h-40 rounded-md object-cover outline outline-1 -outline-offset-1 outline-foreground/10"
      />
    );
  }
  if (memory.kind === "voice") {
    return <audio className="mt-2 w-full" controls preload="none" src={url} />;
  }
  if (memory.kind === "video") {
    return <video className="mt-2 max-h-48 w-full rounded-md" controls preload="none" src={url} />;
  }
  return null;
}
