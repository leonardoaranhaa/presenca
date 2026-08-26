/**
 * Handshake com firmware do traje via WebSocket.
 * Protocolo alinhado a sensation.ts / SUIT_PROTOCOL_DOC.
 */

export type SuitHandshakeState =
  | { status: "idle" }
  | { status: "connecting"; url: string }
  | { status: "connected"; url: string; protocol?: string }
  | { status: "error"; url: string; message: string };

type Listener = (s: SuitHandshakeState) => void;

let state: SuitHandshakeState = { status: "idle" };
let ws: WebSocket | null = null;
const listeners = new Set<Listener>();

function setState(s: SuitHandshakeState) {
  state = s;
  for (const fn of listeners) fn(s);
}

export function onSuitHandshake(fn: Listener) {
  listeners.add(fn);
  fn(state);
  return () => {
    listeners.delete(fn);
  };
}

export function getSuitHandshake() {
  return state;
}

/**
 * Liga ao endpoint, envia hello, espera hello_ack.
 */
export function startSuitHandshake(url: string): void {
  stopSuitHandshake();
  setState({ status: "connecting", url });
  try {
    ws = new WebSocket(url);
  } catch (e) {
    setState({
      status: "error",
      url,
      message: e instanceof Error ? e.message : "URL inválida",
    });
    return;
  }

  const timer = window.setTimeout(() => {
    if (state.status === "connecting") {
      setState({ status: "error", url, message: "Timeout à espera do traje." });
      ws?.close();
    }
  }, 8000);

  ws.onopen = () => {
    ws?.send(
      JSON.stringify({
        type: "hello",
        client: "presenca",
        version: 1,
        capabilities: ["haptic_pattern", "facial"],
      }),
    );
  };

  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(String(ev.data)) as {
        type?: string;
        protocol?: string;
        ok?: boolean;
      };
      if (msg.type === "hello_ack" || msg.type === "hello" || msg.ok) {
        window.clearTimeout(timer);
        setState({
          status: "connected",
          url,
          protocol: msg.protocol || "presenca-suit-v1",
        });
      }
    } catch {
      /* ignore non-json */
    }
  };

  ws.onerror = () => {
    window.clearTimeout(timer);
    setState({ status: "error", url, message: "Erro de WebSocket." });
  };

  ws.onclose = () => {
    window.clearTimeout(timer);
    if (state.status === "connected") {
      setState({ status: "idle" });
    } else if (state.status === "connecting") {
      setState({ status: "error", url, message: "Ligação fechada." });
    }
    ws = null;
  };
}

export function stopSuitHandshake() {
  try {
    ws?.close();
  } catch {
    /* ignore */
  }
  ws = null;
  setState({ status: "idle" });
}

export function getSuitSocket() {
  return ws;
}
