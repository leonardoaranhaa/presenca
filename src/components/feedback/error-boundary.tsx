import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "./error-state";

/**
 * Rede de segurança para subárvores que o `errorComponent` da rota não apanha
 * — em concreto a cena 3D, que corre dentro de um `<Canvas>` e falha por
 * motivos próprios (WebGL indisponível, GLB inválido, contexto perdido).
 *
 * Continua a ser preciso um componente de classe: não há equivalente em hooks.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; title?: string; onError?: (e: Error) => void },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[presenca] erro de render", error, info.componentStack);
    this.props.onError?.(error);
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorState
          error={this.state.error}
          title={this.props.title}
          reset={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}
