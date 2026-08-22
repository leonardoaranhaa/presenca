import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { newPersonaDraft, usePresence } from "@/lib/store";
import {
  AVATAR_HUES,
  RELATIONSHIPS,
  ROOMS,
  TRAIT_OPTIONS,
  type AvatarHue,
  type HairStyle,
  type Persona,
  type PresenceKind,
  type RoomId,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const HAIR: { id: HairStyle; label: string }[] = [
  { id: "short", label: "Curto" },
  { id: "long", label: "Longo" },
  { id: "wavy", label: "Ondulado" },
  { id: "bun", label: "Coque" },
  { id: "bald", label: "Ralo" },
];

export function PersonaForm({
  initial,
  kind,
}: {
  initial?: Persona;
  kind?: PresenceKind;
}) {
  const navigate = useNavigate();
  const upsert = usePresence((s) => s.upsertPersona);
  const [p, setP] = useState<Persona>(initial ?? newPersonaDraft(kind ?? "memorial"));

  function toggleTrait(t: string) {
    setP((prev) => ({
      ...prev,
      traits: prev.traits.includes(t)
        ? prev.traits.filter((x) => x !== t)
        : [...prev.traits, t].slice(0, 6),
    }));
  }

  function save() {
    if (!p.name.trim()) {
      toast.error("Dê um nome à presença.");
      return;
    }
    upsert({ ...p, name: p.name.trim() });
    toast.success(`${p.name.trim()} entrou no lar.`);
    void navigate({ to: "/persona/$id", params: { id: p.id } });
  }

  return (
    <div className="space-y-6">
      {!initial && (
        <div className="grid grid-cols-2 gap-2">
          {(["living", "memorial"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setP((prev) => ({ ...prev, kind: k }))}
              className={cn(
                "rounded-lg px-3 py-3 text-left text-sm shadow-[var(--shadow-border)] transition-colors",
                p.kind === k ? "bg-primary text-primary-foreground" : "bg-surface text-muted",
              )}
            >
              <span className="block font-medium text-inherit">
                {k === "living" ? "Pessoa viva" : "Presença memorial"}
              </span>
              <span className={cn("mt-1 block text-xs", p.kind === k ? "opacity-70" : "text-faint")}>
                {k === "living" ? "Quem ainda caminha no mundo" : "Quem permanece na memória"}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rel">Laço</Label>
          <select
            id="rel"
            value={p.relationship}
            onChange={(e) => setP({ ...p, relationship: e.target.value })}
            className="flex h-11 w-full rounded-md bg-surface-2 px-3 text-sm shadow-[var(--shadow-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
          >
            {RELATIONSHIPS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="room">Cômodo no lar</Label>
          <select
            id="room"
            value={p.room}
            onChange={(e) => setP({ ...p, room: e.target.value as RoomId })}
            className="flex h-11 w-full rounded-md bg-surface-2 px-3 text-sm shadow-[var(--shadow-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
          >
            {ROOMS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="birth">Ano de nascimento</Label>
          <Input
            id="birth"
            inputMode="numeric"
            value={p.birthYear ?? ""}
            onChange={(e) => setP({ ...p, birthYear: Number(e.target.value) || undefined })}
          />
        </div>
        {p.kind === "memorial" && (
          <div className="space-y-1.5">
            <Label htmlFor="death">Ano da partida</Label>
            <Input
              id="death"
              inputMode="numeric"
              value={p.deathYear ?? ""}
              onChange={(e) => setP({ ...p, deathYear: Number(e.target.value) || undefined })}
            />
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="bio">Quem era / quem é</Label>
        <Textarea
          id="bio"
          value={p.bio}
          onChange={(e) => setP({ ...p, bio: e.target.value })}
          placeholder="Jeito, ofício, o que a casa ainda guarda dessa pessoa."
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="speech">Como falava</Label>
        <Textarea
          id="speech"
          value={p.speechNotes}
          onChange={(e) => setP({ ...p, speechNotes: e.target.value })}
          placeholder="Apelidos, bordões, sotaque, o que nunca dizia de frente."
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="fav">O que amava</Label>
        <Textarea
          id="fav"
          value={p.favorites}
          onChange={(e) => setP({ ...p, favorites: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label>Traços</Label>
        <div className="flex flex-wrap gap-1.5">
          {TRAIT_OPTIONS.map((t) => {
            const on = p.traits.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleTrait(t)}
                className={cn(
                  "h-9 rounded-full px-3 text-xs",
                  on ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted",
                )}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Figura no mundo</Label>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(AVATAR_HUES) as AvatarHue[]).map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setP({ ...p, hue: h })}
              className={cn(
                "size-9 rounded-full",
                p.hue === h ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "",
              )}
              style={{ background: AVATAR_HUES[h].cloth }}
              aria-label={AVATAR_HUES[h].label}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {HAIR.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => setP({ ...p, hair: h.id })}
              className={cn(
                "h-9 rounded-full px-3 text-xs",
                p.hair === h.id ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted",
              )}
            >
              {h.label}
            </button>
          ))}
        </div>
      </div>

      <Button onClick={save} className="w-full sm:w-auto">
        Guardar no lar
      </Button>
    </div>
  );
}
