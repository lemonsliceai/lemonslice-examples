export type BridgeEvent =
  | { type: "bridge_ready"; sample_rate: number }
  | { type: "tunnel_connected" }
  | {
      type: "conversation_ready";
      conversation_id: string;
      agent_output_format?: string | null;
      user_input_format?: string | null;
    }
  | { type: "user_transcript"; text: string }
  | { type: "agent_response"; text: string }
  | { type: "avatar_state"; speaking: boolean }
  | {
      type: "interrupted";
      source: "agent" | "user";
      event_id: number | null;
      dropped_chunks: number;
      signalled: boolean;
    }
  | { type: "response_committed" }
  | { type: "playback_finished"; interrupted: boolean; playback_position: number | null }
  | { type: "tunnel_message"; direction: "in" | "out"; message: Record<string, unknown> }
  | { type: "agent_closed"; reason: string }
  | { type: "error"; message: string };

export type SessionInfo = {
  bridge_id: string;
  livekit_url: string;
  livekit_token: string;
  room: string;
  sample_rate: number;
};

export type BridgeConnection = {
  sendAudio: (pcm16: ArrayBuffer) => void;
  sendInterrupt: () => void;
  sendUserMessage: (text: string) => void;
  close: () => void;
};

export async function createSession(): Promise<SessionInfo> {
  const response = await fetch("/api/session", { method: "POST" });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as SessionInfo;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    const detail = body?.detail ?? body?.error ?? body;
    return typeof detail === "string" ? detail : JSON.stringify(detail);
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

export function connectBridge(
  bridgeId: string,
  handlers: {
    onEvent: (event: BridgeEvent) => void;
    onOpen?: () => void;
    onClose?: (event: CloseEvent) => void;
    onError?: () => void;
  },
): BridgeConnection {
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${scheme}://${window.location.host}/api/bridge/${bridgeId}`);
  socket.binaryType = "arraybuffer";

  socket.onopen = () => handlers.onOpen?.();
  socket.onclose = (event) => handlers.onClose?.(event);
  socket.onerror = () => handlers.onError?.();
  socket.onmessage = (event) => {
    if (typeof event.data !== "string") return;
    try {
      handlers.onEvent(JSON.parse(event.data) as BridgeEvent);
    } catch {
      return;
    }
  };

  const sendJson = (payload: Record<string, unknown>) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  };

  return {
    sendAudio(pcm16) {
      // Dropped rather than queued: stale audio is worse than missing audio for
      // turn detection.
      if (socket.readyState === WebSocket.OPEN) socket.send(pcm16);
    },
    sendInterrupt() {
      sendJson({ type: "interrupt" });
    },
    sendUserMessage(text) {
      sendJson({ type: "user_message", text });
    },
    close() {
      socket.onmessage = null;
      socket.onclose = null;
      if (
        socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING
      ) {
        socket.close();
      }
    },
  };
}
