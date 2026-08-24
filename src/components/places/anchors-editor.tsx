import { useState } from "react";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Place, PlaceAnchor } from "@/lib/places";
import { usePresence } from "@/lib/store";
import { uid } from "@/lib/utils";
import type { RoomId } from "@/lib/types";

export function AnchorsEditor({ place }: { place: Place }) {
  const upsertPlace = usePresence((s) => s.upsertPlace);
  const [label, setLabel] = useState("Novo ponto");
  const [x, setX] = useState(0);
  const [z, setZ] = useState(0);

  function saveAnchors(anchors: PlaceAnchor[]) {
    upsertPlace({ ...place, anchors });
  }

  function add() {
    const a: PlaceAnchor = {
      id: uid("anc"),
      label: label.trim() || "Ponto",
      room: (place.anchors[0]?.room ?? "living") as RoomId,
      x,
      z,
    };
    saveAnchors([...place.anchors, a]);
  }

  function update(id: string, patch: Partial<PlaceAnchor>) {
    saveAnchors(place.anchors.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  function remove(id: string) {
    saveAnchors(place.anchors.filter((a) => a.id !== id));
  }

  return (
    <Card className="mt-4 space-y-3 p-4">
      <div className="flex items-center gap-2">
        <MapPin className="size-4 text-accent" />
        <h3 className="font-display text-lg">Âncoras</h3>
      </div>
      <p className="text-xs text-muted">
        Pontos de encontro (sofá, mesa…). No mundo, clique no disco para caminhar. Efeito:{" "}
        <code className="text-[10px]">place.anchors → AnchorsLayer</code>
      </p>
      <ul className="space-y-2">
        {place.anchors.map((a) => (
          <li key={a.id} className="grid grid-cols-[1fr_4rem_4rem_auto] items-center gap-2 text-sm">
            <Input
              value={a.label}
              onChange={(e) => update(a.id, { label: e.target.value })}
              className="h-9"
            />
            <Input
              type="number"
              step="0.1"
              value={a.x}
              onChange={(e) => update(a.id, { x: Number(e.target.value) })}
              className="h-9"
            />
            <Input
              type="number"
              step="0.1"
              value={a.z}
              onChange={(e) => update(a.id, { z: Number(e.target.value) })}
              className="h-9"
            />
            <button
              type="button"
              className="text-xs text-faint hover:text-rose-400"
              onClick={() => remove(a.id)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-[1fr_4rem_4rem_auto] gap-2">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" />
        <Input type="number" step="0.1" value={x} onChange={(e) => setX(Number(e.target.value))} />
        <Input type="number" step="0.1" value={z} onChange={(e) => setZ(Number(e.target.value))} />
        <Button type="button" size="sm" onClick={add}>
          +
        </Button>
      </div>
    </Card>
  );
}
