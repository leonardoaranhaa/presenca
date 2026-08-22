import type { Memory, Persona, SoulProfile } from "@/lib/types";
import { ETHICAL_GUARDRAILS } from "@/lib/ethics";
import { buildSystemPrompt } from "@/lib/seed";
import { modelFromPersona } from "./model";
import {
  skillComposePrompt,
  skillEvolve,
  skillIngestChat,
  skillIngestMemory,
  skillRetrieve,
} from "./skills";
import type { MimeticModel } from "./types";

export class MimeticBrain {
  private model: MimeticModel;
  private persona: Persona;

  constructor(persona: Persona) {
    this.persona = persona;
    this.model = modelFromPersona(persona);
  }

  getModel() {
    return this.model;
  }

  setModel(m: MimeticModel) {
    this.model = m;
  }

  absorbMemory(memory: Memory): MimeticModel {
    const r = skillIngestMemory({ persona: this.persona, model: this.model, memory });
    this.model = skillEvolve({ persona: this.persona, model: r.model }).model;
    return this.model;
  }

  absorbChat(role: "user" | "presence", text: string): MimeticModel {
    const r = skillIngestChat({
      persona: this.persona,
      model: this.model,
      chat: { role, text },
    });
    if (r.model.trainSteps % 3 === 0) {
      this.model = skillEvolve({ persona: this.persona, model: r.model }).model;
    } else {
      this.model = r.model;
    }
    return this.model;
  }

  composeSystemPrompt(query: string): string {
    const retrieved = skillRetrieve({
      persona: this.persona,
      model: this.model,
      query,
    }).output;
    const composed = skillComposePrompt(
      { persona: this.persona, model: this.model, query },
      retrieved || "",
    ).output;
    const base = buildSystemPrompt(this.persona);
    return `${base}\n\n${composed}\n\n${ETHICAL_GUARDRAILS}`;
  }

  toSoulPatch(): Partial<SoulProfile> {
    const m = this.model;
    return {
      summary: m.evolvingSummary || this.persona.soul?.summary || "",
      mannerisms: m.mannerisms.length ? m.mannerisms : this.persona.soul?.mannerisms,
      catchphrases: m.catchphrases.length ? m.catchphrases : this.persona.soul?.catchphrases,
      values: m.values.length ? m.values : this.persona.soul?.values,
      mimetic: m,
      systemPrompt: this.composeSystemPrompt(""),
    };
  }

  static bootstrap(persona: Persona): MimeticBrain {
    const brain = new MimeticBrain(persona);
    if (!brain.model.traces.length && persona.memories.length) {
      for (const mem of persona.memories) brain.absorbMemory(mem);
    }
    return brain;
  }
}

export function applyBrainToPersona(persona: Persona, model: MimeticModel): Persona {
  const withModel: Persona = {
    ...persona,
    soul: {
      awakenedAt: persona.soul?.awakenedAt ?? Date.now(),
      summary: persona.soul?.summary ?? "",
      voice: persona.soul?.voice ?? persona.speechNotes,
      mannerisms: persona.soul?.mannerisms ?? [],
      catchphrases: persona.soul?.catchphrases ?? [],
      values: persona.soul?.values ?? [],
      systemPrompt: persona.soul?.systemPrompt ?? "",
      mimetic: model,
    },
  };
  const brain = new MimeticBrain(withModel);
  // force model
  brain.setModel(model);
  const patch = brain.toSoulPatch();
  return {
    ...withModel,
    soul: {
      ...withModel.soul!,
      summary: patch.summary || withModel.soul!.summary,
      mannerisms: patch.mannerisms || withModel.soul!.mannerisms,
      catchphrases: patch.catchphrases || withModel.soul!.catchphrases,
      values: patch.values || withModel.soul!.values,
      systemPrompt: patch.systemPrompt || buildSystemPrompt(withModel),
      mimetic: model,
    },
  };
}
