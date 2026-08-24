import { createFileRoute } from "@tanstack/react-router";
import { usePresence } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Gauge, Hand, Shield, User, Wifi, Activity, Sparkles } from "lucide-react";
import { Shell } from "@/components/layout/shell";
import { SettingsNav, SettingsSection } from "@/components/settings/settings-section";
import { QualityPanel } from "@/components/settings/quality-panel";
import { MyBodyPanel } from "@/components/persona/my-body-panel";
import { SensationPanel } from "@/components/sensation/sensation-panel";
import { ConnectionPanel } from "@/components/realtime/connection-panel";
import { ServiceStatusPanel } from "@/components/feedback/service-status-panel";
import { PrivacyPanel } from "@/components/legal/privacy-panel";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

const SECTIONS = [
  { id: "qualidade", label: "Qualidade 3D" },
  { id: "corpo", label: "O meu corpo" },
  { id: "sensacao", label: "Sensação" },
  { id: "ligacao", label: "Ligação" },
  { id: "servicos", label: "Serviços" },
  { id: "privacidade", label: "Privacidade" },
  { id: "experiencia", label: "Experiência" },
] as const;

function SettingsPage() {
  return (
    <Shell>
      <div className="pt-6">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Preferências</p>
        <h1 className="mt-2 font-display text-4xl">Configurações</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          Cada caixa controla uma parte da plataforma. O efeito no código está indicado sob o título
          — se não estiver ligado ao runtime, não aparece aqui.
        </p>
      </div>

      <div className="mt-6">
        <SettingsNav items={[...SECTIONS]} />
      </div>

      <div className="mt-6 grid gap-6">
        <SettingsSection
          id="qualidade"
          icon={Gauge}
          title="Qualidade 3D"
          description="Define o custo gráfico no mundo (telemóvel vs desktop)."
          effect="store.qualityTier → getQuality() → Canvas dpr, shadows e antialias em experience.tsx"
        >
          <QualityPanel />
        </SettingsSection>

        <SettingsSection
          id="corpo"
          icon={User}
          title="O meu corpo"
          description="GLB do visitante no lar (scan, Mixamo ou URL)."
          effect="persona.isPlayer.bodyScan → PlayerBody / player-avatar.tsx no mundo"
        >
          <MyBodyPanel />
        </SettingsSection>

        <SettingsSection
          id="sensacao"
          icon={Hand}
          title="Sensação e háptica"
          description="Toque, abraço adaptativo, traje e preferências memoriais."
          effect="localStorage sensation prefs → playSensation / sensation-bridge.tsx no mundo"
        >
          <SensationPanel />
        </SettingsSection>

        <SettingsSection
          id="ligacao"
          icon={Wifi}
          title="Ligação em tempo real"
          description="PartyKit, peers e voz WebRTC no lugar ativo."
          effect="connectPlace() / voice-chat.ts + PartyKit; ICE via /api/turn/credentials"
        >
          <ConnectionPanel />
        </SettingsSection>

        <SettingsSection
          id="servicos"
          icon={Activity}
          title="Estado dos serviços"
          description="IA, voz, embed e TURN — o que está configurado neste ambiente."
          effect="GET /api/status → useServiceStatus (diagnóstico; não altera o mundo)"
        >
          <ServiceStatusPanel />
        </SettingsSection>

        <SettingsSection
          id="privacidade"
          icon={Shield}
          title="Privacidade e LGPD"
          description="Consentimentos, inventário de dados, exportar ou apagar."
          effect="lgpd.ts prefs → featureAllowed() em voz, body scan, chat; export/wipe no store"
        >
          <PrivacyPanel />
        </SettingsSection>

        <SettingsSection
          id="experiencia"
          icon={Sparkles}
          title="Experiência"
          description="Onboarding e atalhos de primeira presença."
          effect="onboarded no store → FirstPresenceWizard na home"
        >
          <OnboardingResetPanel />
        </SettingsSection>
      </div>
    </Shell>
  );
}

function OnboardingResetPanel() {
  const onboarded = usePresence((s) => s.onboarded);
  const reset = usePresence((s) => s.resetOnboarding);
  const complete = usePresence((s) => s.completeOnboarding);
  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted">
        Estado actual:{" "}
        <strong className="text-foreground">
          {onboarded ? "onboarding concluído" : "wizard visível na home"}
        </strong>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            reset();
            toast.message("Onboarding reposto — veja a home.");
          }}
        >
          Mostrar de novo o guia de 10 min
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            complete();
            toast.message("Onboarding marcado como feito.");
          }}
        >
          Marcar como feito
        </Button>
      </div>
    </div>
  );
}
