import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

/**
 * Ecrã de falha da aplicação.
 *
 * O tom importa: quem usa isto pode estar a meio de uma conversa com a
 * presença de alguém que morreu. Uma falha não pode parecer que a memória se
 * perdeu — os dados estão no aparelho e continuam lá.
 */
export function ErrorState({
  error,
  reset,
  title = "Alguma coisa se soltou.",
}: {
  error?: Error;
  reset?: () => void;
  title?: string;
}) {
  const detalhe = error?.message?.slice(0, 300);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="max-w-md space-y-3">
        <h1 className="font-display text-3xl">{title}</h1>
        <p className="text-sm leading-relaxed text-muted">
          O lar continua guardado neste aparelho — nada do que a família confiou se perdeu. Pode
          tentar de novo, ou voltar à entrada.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {reset && (
          <Button type="button" onClick={reset}>
            Tentar de novo
          </Button>
        )}
        <Button asChild variant="outline">
          <Link to="/">Voltar à entrada</Link>
        </Button>
      </div>

      {detalhe && (
        <details className="max-w-md text-left">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-xs text-faint hover:text-muted">
            Detalhe técnico
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-md bg-surface-2 p-3 text-left text-[11px] text-muted">
            {detalhe}
          </pre>
        </details>
      )}
    </div>
  );
}

/** Rota inexistente. */
export function NotFoundState() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="max-w-md space-y-3">
        <h1 className="font-display text-3xl">Não há esta porta no lar.</h1>
        <p className="text-sm leading-relaxed text-muted">
          O endereço não corresponde a nenhum lugar. Talvez o link esteja incompleto.
        </p>
      </div>
      <Button asChild>
        <Link to="/">Voltar à entrada</Link>
      </Button>
    </div>
  );
}
