import { Activity } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useServiceStatus } from "@/lib/use-service-status";

/**
 * O que está mesmo ligado neste ambiente.
 *
 * Um produto que aparenta funcionar e não funciona é pior do que um que
 * declara o que lhe falta — sobretudo este, onde a pessoa pode escrever uma
 * mensagem à presença de alguém que morreu e ficar sem resposta.
 */
export function ServiceStatusPanel() {
  const s = useServiceStatus();

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start gap-3">
        <Activity className="mt-0.5 size-5 text-accent" />
        <div>
          <h2 className="font-display text-xl">O que está ligado</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Algumas partes do lar dependem de serviços configurados por quem o hospeda. O que
            estiver desligado não impede o resto de funcionar.
          </p>
        </div>
      </div>

      {s === undefined && <p className="text-sm text-muted">A verificar…</p>}

      {s === null && (
        <p className="text-sm text-muted">
          Não foi possível verificar o estado dos serviços agora.
        </p>
      )}

      {s && (
        <dl className="space-y-2 text-sm">
          <Linha
            termo="Voz da presença"
            ligado={s.chat}
            ligadoTexto="A presença responde às memórias confiadas."
            desligadoTexto="Não configurada — o cofre funciona, mas a conversa não responde."
          />
          <Linha
            termo="Voz clonada"
            ligado={s.voiceClone}
            ligadoTexto="Disponível, com consentimento da família."
            desligadoTexto="Não configurada — a presença fala pelo leitor do aparelho."
          />
          <Linha
            termo="Voz ao vivo em redes difíceis"
            ligado={s.turn !== "stun-only"}
            ligadoTexto={
              s.turn === "ephemeral"
                ? "TURN com credenciais temporárias."
                : "TURN com credenciais fixas."
            }
            desligadoTexto="Só STUN — funciona na maioria das redes domésticas, pode falhar em redes móveis ou de empresa."
          />
        </dl>
      )}
    </Card>
  );
}

function Linha({
  termo,
  ligado,
  ligadoTexto,
  desligadoTexto,
}: {
  termo: string;
  ligado: boolean;
  ligadoTexto: string;
  desligadoTexto: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden
        className={
          ligado
            ? "mt-1.5 size-2 shrink-0 rounded-full bg-accent"
            : "mt-1.5 size-2 shrink-0 rounded-full bg-faint"
        }
      />
      <div className="min-w-0">
        <dt className="font-medium">
          {termo}{" "}
          <span className="text-xs font-normal text-faint">
            {ligado ? "· ligado" : "· desligado"}
          </span>
        </dt>
        <dd className="text-muted">{ligado ? ligadoTexto : desligadoTexto}</dd>
      </div>
    </div>
  );
}
