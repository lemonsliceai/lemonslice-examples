/** LemonSlice tunnel wire protocol (websocket audio ingress). */

export type TunnelEvent = "open" | "message" | "error" | "close";
export type TunnelListener = (event: TunnelEvent, payload?: unknown) => void;

export type TunnelLogEntry = {
  id: string;
  at: number;
  direction: "in" | "out";
  summary: string;
};

export type TunnelClient = {
  connect: () => Promise<void>;
  sendAudioChunk: (base64Pcm16: string, sampleRate: number) => void;
  sendAudioEnd: () => void;
  sendInterrupt: () => void;
  sendTerminate: () => void;
  sendJson: (obj: Record<string, unknown>) => void;
  close: () => void;
  on: (listener: TunnelListener) => () => void;
};

const DEFAULT_HEARTBEAT_INTERVAL_MS = 15000;

function summarizeMessage(obj: Record<string, unknown>): string {
  const command = typeof obj.command === "string" ? obj.command : "message";
  if (command === "audio") {
    const audio = typeof obj.audio === "string" ? obj.audio : "";
    const approxBytes = Math.floor((audio.length * 3) / 4);
    return `audio sampleRate=${obj.sampleRate ?? "?"} ~${approxBytes}B`;
  }
  if (command === "heartbeat" || command === "heartbeat_ack") {
    return command;
  }
  return JSON.stringify(obj);
}

function parseMessage(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore
  }
  return null;
}

export function createTunnelClient(
  url: string,
  options?: {
    heartbeatIntervalMs?: number;
    onLog?: (entry: TunnelLogEntry) => void;
  },
): TunnelClient {
  let ws: WebSocket | null = null;
  let sendQueue: string[] = [];
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let heartbeatCounter = 0;
  const listeners = new Set<TunnelListener>();
  const heartbeatIntervalMs =
    options?.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;

  function log(direction: "in" | "out", summary: string) {
    options?.onLog?.({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: Date.now(),
      direction,
      summary,
    });
  }

  function notify(event: TunnelEvent, payload?: unknown) {
    for (const listener of listeners) listener(event, payload);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      heartbeatCounter += 1;
      sendJson({
        command: "heartbeat",
        event_id: `hb-${heartbeatCounter}`,
        timestamp: Date.now(),
      });
    }, heartbeatIntervalMs);
  }

  function sendJson(obj: Record<string, unknown>) {
    const raw = JSON.stringify(obj);
    log("out", summarizeMessage(obj));
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(raw);
    else sendQueue.push(raw);
  }

  function connect() {
    return new Promise<void>((resolve, reject) => {
      ws = new WebSocket(url);

      ws.onopen = () => {
        for (const msg of sendQueue) ws?.send(msg);
        sendQueue = [];
        startHeartbeat();
        notify("open");
        resolve();
      };

      ws.onmessage = (ev) => {
        const parsed = parseMessage(ev.data);
        log(
          "in",
          parsed ? summarizeMessage(parsed) : String(ev.data).slice(0, 200),
        );
        notify("message", ev.data);
      };

      ws.onerror = () => {
        notify("error");
        reject(new Error("Tunnel WebSocket error"));
      };

      ws.onclose = (ev) => {
        stopHeartbeat();
        notify("close", ev);
        ws = null;
      };
    });
  }

  function close() {
    stopHeartbeat();
    if (ws) {
      try {
        ws.close();
      } catch {
        // ignore
      }
      ws = null;
    }
    sendQueue = [];
  }

  return {
    connect,
    sendAudioChunk(base64Pcm16, sampleRate) {
      sendJson({
        command: "audio",
        audio: base64Pcm16,
        sampleRate,
        encoding: "PCM16",
      });
    },
    sendAudioEnd() {
      sendJson({ command: "audio_end" });
    },
    sendInterrupt() {
      sendJson({ command: "interrupt" });
    },
    sendTerminate() {
      try {
        sendJson({ command: "terminate" });
      } catch {
        // ignore
      }

      const socket = ws;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        close();
        return;
      }

      const started = Date.now();
      const finish = () => {
        close();
      };
      const poll = () => {
        if (
          !ws ||
          ws !== socket ||
          socket.readyState !== WebSocket.OPEN ||
          socket.bufferedAmount === 0 ||
          Date.now() - started > 500
        ) {
          finish();
          return;
        }
        setTimeout(poll, 10);
      };
      setTimeout(poll, 0);
    },
    sendJson,
    close,
    on(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
